export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp() {
  if (getApps().length) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, password, reparto } = await req.json()
    const adminDb = getFirestore(getAdminApp())

    // Leggi config accesso rapido
    const snap = await adminDb
      .collection('ristoranti').doc(restaurantId)
      .collection('config').doc('accesso-rapido')
      .get()

    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Accesso rapido non configurato' }, { status: 400 })
    }

    const config = snap.data()!
    console.log('Config password:', config.password, 'Tipo:', typeof config.password)
console.log('Password ricevuta:', password, 'Tipo:', typeof password)
const passwordCorretta = String(config.password) === String(password)
console.log('Risultato:', passwordCorretta)

    if (!passwordCorretta) {
      return NextResponse.json({ success: false, error: 'Password errata' }, { status: 401 })
    }

    // Leggi info ristorante
    const ristoranteSnap = await adminDb.collection('ristoranti').doc(restaurantId).get()
    const ristorante = ristoranteSnap.data()

    return NextResponse.json({
      success: true,
      reparto,
      restaurantId,
      restaurantNome: ristorante?.nome || '',
      restaurantColori: ristorante?.colori || {},
    })
  } catch (err: any) {
    console.error('ERRORE ACCESSO RAPIDO:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
