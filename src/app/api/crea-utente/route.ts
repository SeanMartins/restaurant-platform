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

    // ── Autenticazione e autorizzazione ────────────────────────────────
    // Questa route usa le credenziali Admin, che bypassano le regole di
    // Firestore: senza un controllo esplicito qui chiunque potrebbe creare
    // un utente con qualsiasi ruolo (anche superadmin) per qualsiasi ristorante.
    const authHeader = req.headers.get('authorization') || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })
    }

    let chiamanteUid: string
    try {
      chiamanteUid = (await adminAuth.verifyIdToken(idToken)).uid
    } catch {
      return NextResponse.json({ success: false, error: 'Token non valido' }, { status: 401 })
    }

    const chiamanteSnap = await adminDb.collection('utenti').doc(chiamanteUid).get()
    const chiamante = chiamanteSnap.data()

    const { email, password, role, restaurantId, displayName } = await req.json()

    const isSuperAdmin = chiamante?.role === 'superadmin'
    const isManagerDelRistorante = chiamante?.role === 'manager' && chiamante?.restaurantId === restaurantId

    const puoCreare =
      role === 'manager' ? isSuperAdmin
      : role !== 'superadmin' && (isSuperAdmin || isManagerDelRistorante)

    if (!puoCreare) {
      return NextResponse.json({ success: false, error: 'Non autorizzato a creare questo utente' }, { status: 403 })
    }

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