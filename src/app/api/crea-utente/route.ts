import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Inizializza Firebase Admin (solo server)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const adminAuth = getAuth()
const adminDb   = getFirestore()

export async function POST(req: NextRequest) {
  try {
    const { email, password, role, restaurantId, displayName } = await req.json()

    // Crea utente in Firebase Auth
    const userRecord = await adminAuth.createUser({ email, password, displayName })

    // Salva in Firestore
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
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}
