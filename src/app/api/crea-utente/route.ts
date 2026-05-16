import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import serviceAccount from './service-account.json'

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount as any),
  })
}

const adminAuth = getAuth()
const adminDb   = getFirestore()

export async function POST(req: NextRequest) {
  try {
    const { email, password, role, restaurantId, displayName } = await req.json()
    const userRecord = await adminAuth.createUser({ email, password, displayName })
    const userData = {
      uid: userRecord.uid,
      email,
      role,
      restaurantId: restaurantId || null,
      displayName: displayName || '',
      createdAt: new Date().toISOString(),
    }
    await adminDb.collection('utenti').doc(userRecord.uid).set(userData)
    return NextResponse.json({ success: true, uid: userRecord.uid })
  } catch (err: any) {
    console.error('ERRORE CREA UTENTE:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}