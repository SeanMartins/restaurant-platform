export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp() {
  if (getApps().length) return getApps()[0]
  
  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin env vars mancanti')
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const app     = getAdminApp()
    const adminAuth = getAuth(app)
    const adminDb   = getFirestore(app)
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
    console.error('ERRORE:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}