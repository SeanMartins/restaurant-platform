export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, password, reparto } = await req.json()
    const adminDb = getFirestore(getAdminApp())

    const snap = await adminDb
      .collection('ristoranti').doc(restaurantId)
      .collection('config').doc('accesso-rapido')
      .get()

    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Accesso rapido non configurato' }, { status: 400 })
    }

    const config = snap.data()!
    const passwordCorretta = String(config.password) === String(password)

    if (!passwordCorretta) {
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