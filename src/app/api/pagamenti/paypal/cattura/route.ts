export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getPaypalAccessToken, PAYPAL_API_BASE } from '@/lib/paypal'

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  const ordineId     = req.nextUrl.searchParams.get('ordineId')
  const token         = req.nextUrl.searchParams.get('token') // id ordine PayPal
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!restaurantId || !ordineId || !token) {
    return NextResponse.redirect(`${appUrl}/prezzi`)
  }

  try {
    const adminDb = getFirestore(getAdminApp())
    const [ristoranteSnap, ordineSnap, segretoSnap] = await Promise.all([
      adminDb.collection('ristoranti').doc(restaurantId).get(),
      adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId).get(),
      adminDb.collection('ristoranti').doc(restaurantId).collection('config').doc('pagamenti-secret').get(),
    ])

    const ristorante = ristoranteSnap.data()
    const ordine = ordineSnap.data()
    const segreto = segretoSnap.data()
    if (!ristorante || !ordine) return NextResponse.redirect(`${appUrl}/prezzi`)

    const tornaAlMenu = `${appUrl}/${ristorante.slug}?tavolo=${ordine.tavoloId}&n=${ordine.tavoloNumero}`

    // Il Client ID pubblico non serve qui: l'access token si ottiene con id+secret,
    // quindi recuperiamo anche il clientId dal doc pubblico per completezza.
    const configSnap = await adminDb.collection('ristoranti').doc(restaurantId).collection('config').doc('pagamenti').get()
    const clientId     = configSnap.data()?.paypal?.clientId
    const clientSecret = segreto?.paypal?.clientSecret
    if (!clientId || !clientSecret) return NextResponse.redirect(`${tornaAlMenu}&pagamento=annullato`)

    const accessToken = await getPaypalAccessToken(clientId, clientSecret)
    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${token}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    const dati = await res.json()

    if (res.ok && dati.status === 'COMPLETED') {
      await adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId).update({
        stato: 'ricevuto',
        updatedAt: new Date().toISOString(),
      })
      return NextResponse.redirect(`${tornaAlMenu}&pagamento=ok`)
    }

    console.error('ERRORE CATTURA PAYPAL:', dati)
    return NextResponse.redirect(`${tornaAlMenu}&pagamento=annullato`)
  } catch (err: any) {
    console.error('ERRORE CATTURA PAYPAL:', err)
    return NextResponse.redirect(`${appUrl}/prezzi`)
  }
}
