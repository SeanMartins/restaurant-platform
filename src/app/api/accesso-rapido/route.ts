export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from '@/lib/firebase-admin'
import { hashPin, verificaPin, verificaPinInChiaro } from '@/lib/pin-hash'

// Reparti per cui si può ottenere un token di accesso rapido: devono
// coincidere con la lista in isStaffRapidoOf() di firestore.rules.
const REPARTI_VALIDI = ['cucina', 'pizzeria', 'bar', 'pasticceria', 'antipasti', 'cassa']

// ─── RATE LIMIT ──────────────────────────────────────────────────────────────
// Un PIN è corto: senza un limite ai tentativi sarebbe bruteforcabile in pochi
// secondi. Usiamo Firestore (già disponibile, nessun servizio esterno) per
// contare i tentativi falliti in una finestra temporale, con blocco oltre soglia:
// - per IP + ristorante (il singolo dispositivo che sbaglia);
// - per ristorante nel complesso, contro chi ruota molti IP. Soglia alta, perché
//   un blocco globale ferma anche lo staff: è il compromesso per non lasciare
//   tentativi illimitati.
const LIMITE_IP      = { max: 5,  finestraMs: 5 * 60 * 1000,  bloccoMs: 5 * 60 * 1000 }
const LIMITE_GLOBALE = { max: 50, finestraMs: 10 * 60 * 1000, bloccoMs: 10 * 60 * 1000 }
const DOC_GLOBALE = '_ristorante' // un IP non inizia mai con "_"

type EsitoRateLimit =
  | { esito: 'non-configurato' }
  | { esito: 'bloccato'; riprovaTraSecondi: number }
  | { esito: 'password-errata' }
  | { esito: 'ok' }

// Su Vercel x-forwarded-for / x-real-ip sono impostati dal proxy della
// piattaforma (il valore inviato dal client viene sovrascritto).
function getClientIp(req: NextRequest): string {
  return req.ip
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown'
}

// I doc ID Firestore non possono contenere "/"; IPv6 e IPv4 sono altrimenti ok.
function sanitizeDocId(id: string): string {
  const pulito = id.replace(/[/\\]/g, '_').slice(0, 200)
  return pulito || 'unknown'
}

interface Contatore { tentativiFalliti?: number; primoTentativo?: number; bloccatoFino?: number | null }

function bloccoAttivo(c: Contatore | undefined, now: number) {
  return c?.bloccatoFino && c.bloccatoFino > now ? c.bloccatoFino : null
}

// Nuovo stato del contatore dopo un tentativo fallito
function dopoErrore(c: Contatore | undefined, limite: typeof LIMITE_IP, now: number): Contatore {
  const finestraValida = !!c?.primoTentativo && (now - c.primoTentativo) < limite.finestraMs
  const tentativi = (finestraValida ? c!.tentativiFalliti || 0 : 0) + 1
  return {
    tentativiFalliti: tentativi,
    primoTentativo: finestraValida ? c!.primoTentativo : now,
    bloccatoFino: tentativi >= limite.max ? now + limite.bloccoMs : null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, password, reparto } = await req.json()
    if (typeof restaurantId !== 'string' || !restaurantId || typeof password !== 'string' || !password || password.length > 64) {
      return NextResponse.json({ success: false, error: 'Parametri mancanti' }, { status: 400 })
    }
    if (!REPARTI_VALIDI.includes(reparto)) {
      return NextResponse.json({ success: false, error: 'Reparto non valido' }, { status: 400 })
    }

    const adminDb = getFirestore(getAdminApp())
    const ristoranteRef = adminDb.collection('ristoranti').doc(restaurantId)
    const rateLimitRef = ristoranteRef.collection('rateLimitAccessoRapido').doc(sanitizeDocId(getClientIp(req)))
    const globaleRef = ristoranteRef.collection('rateLimitAccessoRapido').doc(DOC_GLOBALE)
    const configRef = ristoranteRef.collection('config').doc('accesso-rapido')

    const now = Date.now()

    const esito = await adminDb.runTransaction<EsitoRateLimit>(async (tx) => {
      const [ipSnap, globaleSnap, configSnap] = await Promise.all([tx.get(rateLimitRef), tx.get(globaleRef), tx.get(configRef)])
      const config = configSnap.data()
      if (!config || config.abilitato === false || (!config.passwordHash && !config.password)) {
        return { esito: 'non-configurato' }
      }

      const contIp = ipSnap.data() as Contatore | undefined
      const contGlobale = globaleSnap.data() as Contatore | undefined

      // Blocco ancora attivo: rifiuta senza nemmeno controllare la password,
      // altrimenti il blocco non protegge da bruteforce.
      const bloccatoFino = Math.max(bloccoAttivo(contIp, now) || 0, bloccoAttivo(contGlobale, now) || 0)
      if (bloccatoFino) {
        return { esito: 'bloccato', riprovaTraSecondi: Math.ceil((bloccatoFino - now) / 1000) }
      }

      const passwordCorretta = config.passwordHash
        ? verificaPin(config.passwordHash, password)
        : verificaPinInChiaro(String(config.password), password)

      if (passwordCorretta) {
        tx.set(rateLimitRef, { tentativiFalliti: 0, primoTentativo: now, bloccatoFino: null })
        // PIN salvato prima dell'hash: lo converte ora e cancella il valore in chiaro
        if (!config.passwordHash) {
          tx.set(configRef, { passwordHash: hashPin(password), password: FieldValue.delete() }, { merge: true })
        }
        return { esito: 'ok' }
      }

      const nuovoIp = dopoErrore(contIp, LIMITE_IP, now)
      const nuovoGlobale = dopoErrore(contGlobale, LIMITE_GLOBALE, now)
      tx.set(rateLimitRef, nuovoIp)
      tx.set(globaleRef, nuovoGlobale)
      const nuovoBlocco = Math.max(nuovoIp.bloccatoFino || 0, nuovoGlobale.bloccatoFino || 0)
      if (nuovoBlocco) return { esito: 'bloccato', riprovaTraSecondi: Math.ceil((nuovoBlocco - now) / 1000) }
      return { esito: 'password-errata' }
    })

    if (esito.esito === 'bloccato') {
      const minuti = Math.ceil(esito.riprovaTraSecondi / 60)
      return NextResponse.json({
        success: false,
        error: `Troppi tentativi falliti. Riprova tra ${minuti} minut${minuti === 1 ? 'o' : 'i'}.`,
      }, { status: 429 })
    }

    // Stessa risposta per "non configurato" e "password errata": non rivela
    // quali ristoranti hanno l'accesso rapido attivo
    if (esito.esito !== 'ok') {
      return NextResponse.json({ success: false, error: 'Password errata' }, { status: 401 })
    }

    const ristorante = (await ristoranteRef.get()).data()

    // Sessione vera: il client fa signInWithCustomToken e le regole Firestore
    // concedono l'accesso agli ordini solo con questi claims. Un uid per
    // reparto+ristorante, senza profilo in /utenti.
    const token = await getAuth(getAdminApp()).createCustomToken(
      `rapido_${restaurantId}_${reparto}`,
      { accessoRapido: true, restaurantId, role: reparto },
    )

    return NextResponse.json({
      success: true, reparto, restaurantId, token,
      restaurantNome: ristorante?.nome || '',
    })
  } catch (err) {
    console.error('ERRORE ACCESSO RAPIDO:', err)
    return NextResponse.json({ success: false, error: 'Errore del server' }, { status: 500 })
  }
}
