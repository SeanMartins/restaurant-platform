import type { NextRequest } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from './firebase-admin'
import type { AppUser } from '@/types'

// Le route con credenziali Admin bypassano le regole Firestore: ognuna deve
// verificare esplicitamente chi chiama. Legge l'ID token dall'header
// "Authorization: Bearer <token>" (checkRevoked: un utente disabilitato perde
// subito l'accesso) e il profilo da /utenti. null = non autenticato.
export async function getChiamante(req: NextRequest): Promise<{ uid: string; utente: AppUser | null } | null> {
  const authHeader = req.headers.get('authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) return null
  try {
    const { uid } = await getAuth(getAdminApp()).verifyIdToken(idToken, true)
    const snap = await getFirestore(getAdminApp()).collection('utenti').doc(uid).get()
    return { uid, utente: (snap.data() as AppUser) || null }
  } catch {
    return null
  }
}

export function isSuperAdmin(utente: AppUser | null | undefined) {
  return utente?.role === 'superadmin'
}

// Manager di quel ristorante oppure superadmin
export function puoGestireRistorante(utente: AppUser | null | undefined, restaurantId: string) {
  return isSuperAdmin(utente)
    || (utente?.role === 'manager' && typeof utente.restaurantId === 'string' && utente.restaurantId === restaurantId)
}
