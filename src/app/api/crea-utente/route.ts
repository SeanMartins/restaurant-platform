export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'

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