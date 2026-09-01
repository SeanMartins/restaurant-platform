export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getStripeForRestaurant } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, ordineId } = await req.json()
    if (!restaurantId || !ordineId) {
      return NextResponse.json({ success: false, error: 'Parametri mancanti' }, { status: 400 })
    }

    const adminDb = getFirestore(getAdminApp())

    const [ristoranteSnap, ordineSnap, configSnap, segretoSnap] = await Promise.all([
      adminDb.collection('ristoranti').doc(restaurantId).get(),
      adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId).get(),
      adminDb.collection('ristoranti').doc(restaurantId).collection('config').doc('pagamenti').get(),
      adminDb.collection('ristoranti').doc(restaurantId).collection('config').doc('pagamenti-secret').get(),
    ])

    if (!ristoranteSnap.exists) return NextResponse.json({ success: false, error: 'Ristorante non trovato' }, { status: 404 })
    if (!ordineSnap.exists)     return NextResponse.json({ success: false, error: 'Ordine non trovato' }, { status: 404 })

    const ristorante = ristoranteSnap.data()!
    const ordine = ordineSnap.data()!
    const config = configSnap.data()
    const segreto = segretoSnap.data()

    const secretKey = segreto?.stripe?.secretKey
    if (!config?.stripe?.abilitato || !secretKey) {
      return NextResponse.json({ success: false, error: 'Stripe non configurato per questo ristorante' }, { status: 400 })
    }

    const stripe = getStripeForRestaurant(secretKey)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const tornaAlMenu = `${appUrl}/${ristorante.slug}?tavolo=${ordine.tavoloId}&n=${ordine.tavoloNumero}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Ordine Tavolo ${ordine.tavoloNumero} — ${ristorante.nome}` },
          unit_amount: Math.round(ordine.totale * 100),
        },
        quantity: 1,
      }],
      metadata: { restaurantId, ordineId },
      success_url: `${tornaAlMenu}&pagamento=ok`,
      cancel_url: `${tornaAlMenu}&pagamento=annullato`,
    })

    return NextResponse.json({ success: true, url: session.url })
  } catch (err: any) {
    console.error('ERRORE CHECKOUT STRIPE RISTORANTE:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
