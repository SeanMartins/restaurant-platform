export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getPaypalAccessToken, PAYPAL_API_BASE } from '@/lib/paypal'

// Ritorno da PayPal dopo l'approvazione (PayPal fa redirect con GET, ?token=<id ordine PayPal>).
// I parametri arrivano dal browser, quindi prima di catturare si verifica che:
// - l'ordine sia ancora "in_attesa_pagamento" e che il token sia l'ordine PayPal
//   creato dal nostro checkout per QUESTO ordine (paypalOrderId);
// - l'ordine PayPal abbia custom_id = ordineId e l'importo atteso in EUR;
// - la cattura sia COMPLETED per lo stesso importo.
// L'ordine passa a "ricevuto" in una transazione, una sola volta.
function stessoImporto(valore: unknown, atteso: number) {
  return typeof valore === 'string' && Math.round(Number(valore) * 100) === Math.round(atteso * 100)
}

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  const ordineId     = req.nextUrl.searchParams.get('ordineId')
  const token        = req.nextUrl.searchParams.get('token') // id ordine PayPal
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!restaurantId || !ordineId || !token) {
    return NextResponse.redirect(`${appUrl}/prezzi`)
  }

  try {
    const adminDb = getFirestore(getAdminApp())
    const ristoranteRef = adminDb.collection('ristoranti').doc(restaurantId)
    const ordineRef = ristoranteRef.collection('ordini').doc(ordineId)
    const [ristoranteSnap, ordineSnap, configSnap, segretoSnap] = await Promise.all([
      ristoranteRef.get(),
      ordineRef.get(),
      ristoranteRef.collection('config').doc('pagamenti').get(),
      ristoranteRef.collection('config').doc('pagamenti-secret').get(),
    ])

    const ristorante = ristoranteSnap.data()
    const ordine = ordineSnap.data()
    if (!ristorante || !ordine) return NextResponse.redirect(`${appUrl}/prezzi`)

    const tornaAlMenu = `${appUrl}/${ristorante.slug}?tavolo=${encodeURIComponent(ordine.tavoloId)}&n=${encodeURIComponent(ordine.tavoloNumero)}`
    const annullato = NextResponse.redirect(`${tornaAlMenu}&pagamento=annullato`)

    // Il token deve essere l'ordine PayPal creato dal nostro checkout per questo ordine
    if (!ordine.paypalOrderId || ordine.paypalOrderId !== token || typeof ordine.importoAtteso !== 'number') {
      console.error(`CATTURA PAYPAL RIFIUTATA: token ${token} non associato all'ordine ${restaurantId}/${ordineId}`)
      return annullato
    }
    // Ricarica della pagina di ritorno dopo una cattura già riuscita
    if (ordine.stato !== 'in_attesa_pagamento') {
      return NextResponse.redirect(`${tornaAlMenu}&pagamento=${ordine.riferimentoPagamento ? 'ok' : 'annullato'}`)
    }

    const clientId     = configSnap.data()?.paypal?.clientId
    const clientSecret = segretoSnap.data()?.paypal?.clientSecret
    if (!clientId || !clientSecret) return annullato

    const accessToken = await getPaypalAccessToken(clientId, clientSecret)
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

    // Verifica l'ordine PayPal prima di catturare
    const resOrdine = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(token)}`, { headers })
    const ordinePaypal = await resOrdine.json()
    const unita = ordinePaypal?.purchase_units?.[0]
    if (!resOrdine.ok || ordinePaypal.status !== 'APPROVED' || unita?.custom_id !== ordineId
        || unita?.amount?.currency_code !== 'EUR' || !stessoImporto(unita?.amount?.value, ordine.importoAtteso)) {
      console.error('CATTURA PAYPAL RIFIUTATA: ordine PayPal non corrispondente', {
        restaurantId, ordineId, status: ordinePaypal?.status, custom_id: unita?.custom_id, amount: unita?.amount,
      })
      return annullato
    }

    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(token)}/capture`, {
      method: 'POST',
      headers: { ...headers, 'PayPal-Request-Id': `cattura-${ordineId}` }, // idempotenza lato PayPal
    })
    const dati = await res.json()
    const cattura = dati?.purchase_units?.[0]?.payments?.captures?.[0]

    if (!res.ok || dati.status !== 'COMPLETED' || cattura?.status !== 'COMPLETED'
        || cattura?.amount?.currency_code !== 'EUR' || !stessoImporto(cattura?.amount?.value, ordine.importoAtteso)) {
      console.error('ERRORE CATTURA PAYPAL:', { restaurantId, ordineId, status: dati?.status, cattura })
      return annullato
    }

    const aggiornato = await adminDb.runTransaction(async (tx) => {
      const attuale = (await tx.get(ordineRef)).data()
      if (attuale?.stato !== 'in_attesa_pagamento') return false
      tx.update(ordineRef, { stato: 'ricevuto', riferimentoPagamento: cattura.id, updatedAt: new Date().toISOString() })
      return true
    })
    if (!aggiornato) {
      // Es. ordine annullato dal cliente mentre pagava: il denaro è stato incassato, va gestito a mano
      console.error(`PAGAMENTO PAYPAL INCASSATO SU ORDINE NON PIÙ IN ATTESA: ${restaurantId}/${ordineId}, capture ${cattura.id}`)
    }
    return NextResponse.redirect(`${tornaAlMenu}&pagamento=ok`)
  } catch (err) {
    console.error('ERRORE CATTURA PAYPAL:', err)
    return NextResponse.redirect(`${appUrl}/prezzi`)
  }
}
