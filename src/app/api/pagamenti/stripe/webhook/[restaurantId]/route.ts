export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getStripeForRestaurant } from '@/lib/stripe'

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const ordineId = session.metadata?.ordineId
      if (ordineId) {
        await adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId).update({
          stato: 'ricevuto',
          updatedAt: new Date().toISOString(),
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('ERRORE WEBHOOK STRIPE RISTORANTE:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
