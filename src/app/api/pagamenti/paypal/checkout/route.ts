export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getPaypalAccessToken, PAYPAL_API_BASE } from '@/lib/paypal'
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

    if (ordine.stato !== 'in_attesa_pagamento' || ordine.metodoPagamento !== 'paypal') {
      return NextResponse.json({ success: false, error: 'Ordine non in attesa di pagamento PayPal' }, { status: 409 })
    }

    const clientId     = config?.paypal?.clientId
    const clientSecret = segreto?.paypal?.clientSecret
    if (!config?.paypal?.abilitato || !clientId || !clientSecret) {
      return NextResponse.json({ success: false, error: 'PayPal non configurato per questo ristorante' }, { status: 400 })
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

    const accessToken = await getPaypalAccessToken(clientId, clientSecret)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const tornaAlMenu = `${appUrl}/${ristorante.slug}?tavolo=${encodeURIComponent(ordine.tavoloId)}&n=${encodeURIComponent(ordine.tavoloNumero)}`

    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: ordineId,
          amount: { currency_code: 'EUR', value: totaleReale.toFixed(2) },
        }],
        application_context: {
          return_url: `${appUrl}/api/pagamenti/paypal/cattura?restaurantId=${encodeURIComponent(restaurantId)}&ordineId=${encodeURIComponent(ordineId)}`,
          cancel_url: `${tornaAlMenu}&pagamento=annullato`,
          user_action: 'PAY_NOW',
        },
      }),
    })

    const dati = await res.json()
    if (!res.ok) {
      console.error('ERRORE CREAZIONE ORDINE PAYPAL:', dati)
      return NextResponse.json({ success: false, error: 'Creazione ordine PayPal fallita' }, { status: 500 })
    }

    const linkApprova = dati.links?.find((l: any) => l.rel === 'approve')?.href
    if (!linkApprova) return NextResponse.json({ success: false, error: 'Link di approvazione PayPal mancante' }, { status: 500 })

    // La cattura accetta solo questo ordine PayPal e questo importo per l'ordine.
    // Allinea anche il totale a quello reale, così la cassa mostra l'importo pagato.
    await adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId).update({
      totale: totaleReale,
      importoAtteso: totaleReale,
      paypalOrderId: dati.id,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, url: linkApprova })
  } catch (err: any) {
    console.error('ERRORE CHECKOUT PAYPAL:', err)
    return NextResponse.json({ success: false, error: 'Errore nel checkout PayPal' }, { status: 500 })
  }
}
