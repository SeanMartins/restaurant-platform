export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getStripeForRestaurant } from '@/lib/stripe'
import { ricalcolaTotaleOrdine, OrdineTotaleError } from '@/lib/ordine-totale'

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

    if (ordine.stato !== 'in_attesa_pagamento' || ordine.metodoPagamento !== 'stripe') {
      return NextResponse.json({ success: false, error: 'Ordine non in attesa di pagamento con carta' }, { status: 409 })
    }

    const secretKey = segreto?.stripe?.secretKey
    if (!config?.stripe?.abilitato || !secretKey) {
      return NextResponse.json({ success: false, error: 'Stripe non configurato per questo ristorante' }, { status: 400 })
    }

    // L'importo da pagare si ricalcola sempre dai prezzi attuali del menu,
    // senza fidarsi di `ordine.totale` salvato sul documento.
    let totaleReale: number
    try {
      totaleReale = await ricalcolaTotaleOrdine(adminDb, restaurantId, ordine as any)
    } catch (err: any) {
      if (err instanceof OrdineTotaleError) {
        return NextResponse.json({ success: false, error: `Ordine non valido: ${err.message}` }, { status: 400 })
      }
      throw err
    }

    const stripe = getStripeForRestaurant(secretKey)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const tornaAlMenu = `${appUrl}/${ristorante.slug}?tavolo=${encodeURIComponent(ordine.tavoloId)}&n=${encodeURIComponent(ordine.tavoloNumero)}`

    const session = await stripe.checkout.sessions.create({
      client_reference_id: ordineId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Ordine Tavolo ${ordine.tavoloNumero} — ${ristorante.nome}` },
          unit_amount: Math.round(totaleReale * 100),
        },
        quantity: 1,
      }],
      metadata: { restaurantId, ordineId },
      success_url: `${tornaAlMenu}&pagamento=ok`,
      cancel_url: `${tornaAlMenu}&pagamento=annullato`,
    })

    // Il webhook accetta solo questa sessione e questo importo per l'ordine.
    // Allinea anche il totale a quello reale, così la cassa mostra l'importo pagato.
    await adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId).update({
      totale: totaleReale,
      importoAtteso: totaleReale,
      stripeSessionId: session.id,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, url: session.url })
  } catch (err: any) {
    console.error('ERRORE CHECKOUT STRIPE RISTORANTE:', err)
    return NextResponse.json({ success: false, error: 'Errore nel checkout con carta' }, { status: 500 })
  }
}
