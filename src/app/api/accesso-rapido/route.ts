export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'

// ─── RATE LIMIT ──────────────────────────────────────────────────────────────
// Il PIN/password di reparto viene confrontato in chiaro: senza un limite ai
// tentativi sarebbe bruteforcabile in pochi secondi. Usiamo Firestore (già
// disponibile, nessun servizio esterno) per contare i tentativi falliti per
// IP + ristorante in una finestra temporale, con blocco temporaneo oltre soglia.
const MAX_TENTATIVI = 5
const FINESTRA_MS = 5 * 60 * 1000   // finestra in cui si contano i tentativi falliti
const BLOCCO_MS = 5 * 60 * 1000     // durata del blocco una volta superata la soglia

type EsitoRateLimit =
  | { esito: 'non-configurato' }
  | { esito: 'bloccato' | 'bloccato-ora'; riprovaTraSecondi: number }
  | { esito: 'password-errata'; tentativiRimasti: number }
  | { esito: 'ok' }

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

// I doc ID Firestore non possono contenere "/"; IPv6 e IPv4 sono altrimenti ok.
function sanitizeDocId(id: string): string {
  const pulito = id.replace(/[/\\]/g, '_').slice(0, 200)
  return pulito || 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, password, reparto } = await req.json()
    if (!restaurantId || !password) {
      return NextResponse.json({ success: false, error: 'Parametri mancanti' }, { status: 400 })
    }

    const adminDb = getFirestore(getAdminApp())
    const ip = getClientIp(req)

    const rateLimitRef = adminDb
      .collection('ristoranti').doc(restaurantId)
      .collection('rateLimitAccessoRapido').doc(sanitizeDocId(ip))
    const configRef = adminDb
      .collection('ristoranti').doc(restaurantId)
      .collection('config').doc('accesso-rapido')

    const now = Date.now()

    const esito = await adminDb.runTransaction<EsitoRateLimit>(async (tx) => {
      const [rateLimitSnap, configSnap] = await Promise.all([tx.get(rateLimitRef), tx.get(configRef)])

      if (!configSnap.exists) {
        return { esito: 'non-configurato' }
      }

      const rl = rateLimitSnap.exists ? rateLimitSnap.data()! : null
      const bloccatoFino: number | undefined = rl?.bloccatoFino ?? undefined

      // Blocco ancora attivo: rifiuta senza nemmeno controllare la password,
      // altrimenti il blocco non protegge da bruteforce.
      if (bloccatoFino && bloccatoFino > now) {
        return { esito: 'bloccato', riprovaTraSecondi: Math.ceil((bloccatoFino - now) / 1000) }
      }

      // Finestra ancora valida (e non in blocco scaduto da resettare) -> riusa il contatore esistente,
      // altrimenti riparti da zero.
      const finestraValida = !!rl?.primoTentativo && (now - rl.primoTentativo) < FINESTRA_MS
      const tentativiPrecedenti = finestraValida ? (rl!.tentativiFalliti || 0) : 0
      const primoTentativo = finestraValida ? rl!.primoTentativo : now

      const config = configSnap.data()!
      const passwordCorretta = String(config.password) === String(password)

      if (passwordCorretta) {
        tx.set(rateLimitRef, { tentativiFalliti: 0, primoTentativo: now, bloccatoFino: null })
        return { esito: 'ok' }
      }

      const nuoviTentativi = tentativiPrecedenti + 1
      if (nuoviTentativi >= MAX_TENTATIVI) {
        tx.set(rateLimitRef, {
          tentativiFalliti: nuoviTentativi,
          primoTentativo,
          bloccatoFino: now + BLOCCO_MS,
        })
        return { esito: 'bloccato-ora', riprovaTraSecondi: Math.ceil(BLOCCO_MS / 1000) }
      }

      tx.set(rateLimitRef, { tentativiFalliti: nuoviTentativi, primoTentativo, bloccatoFino: null })
      return { esito: 'password-errata', tentativiRimasti: MAX_TENTATIVI - nuoviTentativi }
    })

    if (esito.esito === 'non-configurato') {
      return NextResponse.json({ success: false, error: 'Accesso rapido non configurato' }, { status: 400 })
    }

    if (esito.esito === 'bloccato' || esito.esito === 'bloccato-ora') {
      const minuti = Math.ceil(esito.riprovaTraSecondi / 60)
      return NextResponse.json({
        success: false,
        error: `Troppi tentativi falliti. Riprova tra ${minuti} minut${minuti === 1 ? 'o' : 'i'}.`,
      }, { status: 429 })
    }

    if (esito.esito === 'password-errata') {
      return NextResponse.json({ success: false, error: 'Password errata' }, { status: 401 })
    }

    const ristoranteSnap = await adminDb.collection('ristoranti').doc(restaurantId).get()
    const ristorante = ristoranteSnap.data()

    return NextResponse.json({
      success: true, reparto, restaurantId,
      restaurantNome: ristorante?.nome || '',
    })
  } catch (err: any) {
    console.error('ERRORE ACCESSO RAPIDO:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
