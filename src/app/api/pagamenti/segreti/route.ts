export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getChiamante, puoGestireRistorante } from '@/lib/auth-server'

// Chiavi segrete Stripe/PayPal di un ristorante (config/pagamenti-secret).
// Le regole Firestore non permettono più di leggerle o scriverle dal client:
// il manager le imposta da qui e riceve indietro solo una versione mascherata,
// così un XSS o una sessione rubata non possono leggere le chiavi live.
const CAMPI = {
  stripeSecretKey:     { percorso: ['stripe', 'secretKey'],     formato: /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/ },
  stripeWebhookSecret: { percorso: ['stripe', 'webhookSecret'], formato: /^whsec_[A-Za-z0-9]+$/ },
  paypalClientSecret:  { percorso: ['paypal', 'clientSecret'],  formato: /^[A-Za-z0-9_-]{20,}$/ },
} as const
type Campo = keyof typeof CAMPI

function maschera(valore: unknown): string | null {
  if (typeof valore !== 'string' || !valore) return null
  const prefisso = valore.match(/^(sk_live_|sk_test_|rk_live_|rk_test_|whsec_)/)?.[0] || ''
  return `${prefisso}…${valore.slice(-4)}`
}

function segretoRef(restaurantId: string) {
  return getFirestore(getAdminApp()).collection('ristoranti').doc(restaurantId).collection('config').doc('pagamenti-secret')
}

async function leggiMascherati(restaurantId: string) {
  const dati = (await segretoRef(restaurantId).get()).data() || {}
  return Object.fromEntries((Object.keys(CAMPI) as Campo[]).map(c => {
    const [gruppo, chiave] = CAMPI[c].percorso
    return [c, maschera(dati[gruppo]?.[chiave])]
  }))
}

async function autorizza(req: NextRequest, restaurantId: string | null) {
  const chiamante = await getChiamante(req)
  if (!chiamante) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })
  if (!restaurantId || !puoGestireRistorante(chiamante.utente, restaurantId)) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  const rifiuto = await autorizza(req, restaurantId)
  if (rifiuto) return rifiuto
  try {
    return NextResponse.json({ success: true, segreti: await leggiMascherati(restaurantId!) })
  } catch (err) {
    console.error('ERRORE LETTURA SEGRETI PAGAMENTO:', err)
    return NextResponse.json({ success: false, error: 'Errore nella lettura' }, { status: 500 })
  }
}

// Body: { restaurantId, stripeSecretKey?, stripeWebhookSecret?, paypalClientSecret? }
// Un campo assente o vuoto lascia invariato il valore salvato.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const restaurantId = typeof body.restaurantId === 'string' ? body.restaurantId : null
    const rifiuto = await autorizza(req, restaurantId)
    if (rifiuto) return rifiuto

    const aggiornamento: Record<string, Record<string, string>> = {}
    for (const c of Object.keys(CAMPI) as Campo[]) {
      const valore = typeof body[c] === 'string' ? body[c].trim() : ''
      if (!valore) continue
      if (!CAMPI[c].formato.test(valore)) {
        return NextResponse.json({ success: false, error: `Formato non valido per ${c}` }, { status: 400 })
      }
      const [gruppo, chiave] = CAMPI[c].percorso
      aggiornamento[gruppo] = { ...aggiornamento[gruppo], [chiave]: valore }
    }

    if (Object.keys(aggiornamento).length > 0) {
      await segretoRef(restaurantId!).set(aggiornamento, { merge: true })
    }
    return NextResponse.json({ success: true, segreti: await leggiMascherati(restaurantId!) })
  } catch (err) {
    console.error('ERRORE SALVATAGGIO SEGRETI PAGAMENTO:', err)
    return NextResponse.json({ success: false, error: 'Errore nel salvataggio' }, { status: 500 })
  }
}
