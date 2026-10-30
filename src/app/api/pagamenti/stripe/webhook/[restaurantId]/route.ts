export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getStripeForRestaurant } from '@/lib/stripe'

// Segna l'ordine come pagato solo se la sessione è quella creata dal nostro
// checkout per questo ordine (stripeSessionId), è stata pagata e l'importo
// coincide. Idempotente: un ordine non più "in_attesa_pagamento" resta com'è.
async function segnaOrdinePagato(adminDb: Firestore, restaurantId: string, session: Stripe.Checkout.Session) {
  const ordineId = session.metadata?.ordineId
  if (!ordineId || session.metadata?.restaurantId !== restaurantId) {
    console.error(`WEBHOOK STRIPE: sessione ${session.id} senza ordine di questo ristorante (${restaurantId})`)
    return
  }
  if (session.payment_status !== 'paid') {
    console.log(`WEBHOOK STRIPE: sessione ${session.id} non ancora pagata (${session.payment_status}), attendo`)
    return
  }

  const ordineRef = adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId)
  const esito = await adminDb.runTransaction(async (tx) => {
    const ordine = (await tx.get(ordineRef)).data()
    if (!ordine) return 'ordine-inesistente'
    if (ordine.stato !== 'in_attesa_pagamento') return 'gia-processato'
    if (ordine.stripeSessionId !== session.id) return 'sessione-diversa'
    if (typeof ordine.importoAtteso !== 'number' || session.currency !== 'eur'
        || session.amount_total !== Math.round(ordine.importoAtteso * 100)) return 'importo-diverso'
    tx.update(ordineRef, {
      stato: 'ricevuto',
      riferimentoPagamento: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
      updatedAt: new Date().toISOString(),
    })
    return 'ok'
  })

  if (esito !== 'ok' && esito !== 'gia-processato') {
    // Il cliente ha pagato ma l'ordine non torna: va controllato a mano
    console.error(`WEBHOOK STRIPE: pagamento non applicato (${esito})`, {
      restaurantId, ordineId, sessionId: session.id, amount_total: session.amount_total, currency: session.currency,
    })
  }
}

export async function POST(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  const { restaurantId } = params
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()

  try {
    const adminDb = getFirestore(getAdminApp())
    const segretoSnap = await adminDb.collection('ristoranti').doc(restaurantId).collection('config').doc('pagamenti-secret').get()
    const segreto = segretoSnap.data()
    const secretKey     = segreto?.stripe?.secretKey
    const webhookSecret = segreto?.stripe?.webhookSecret

    if (!secretKey || !webhookSecret || !signature) {
      return NextResponse.json({ error: 'Webhook non configurato per questo ristorante' }, { status: 400 })
    }

    const stripe = getStripeForRestaurant(secretKey)
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (err: any) {
      console.error('Firma webhook Stripe non valida:', err.message)
      return NextResponse.json({ error: 'Firma non valida' }, { status: 400 })
    }

    // checkout.session.completed arriva anche per metodi asincroni non ancora
    // pagati: in quel caso si aspetta async_payment_succeeded.
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await segnaOrdinePagato(adminDb, restaurantId, event.data.object as Stripe.Checkout.Session)
    }

    // Le anomalie vengono solo loggate e si risponde 200: un retry di Stripe
    // non le risolverebbe.
    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('ERRORE WEBHOOK STRIPE RISTORANTE:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
