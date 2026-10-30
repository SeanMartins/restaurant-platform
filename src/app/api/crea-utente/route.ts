export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getChiamante, isSuperAdmin, puoGestireRistorante } from '@/lib/auth-server'
import type { AppUser, UserRole } from '@/types'

// Questa route usa le credenziali Admin, che bypassano le regole di
// Firestore: senza un controllo esplicito qui chiunque potrebbe creare un
// utente con qualsiasi ruolo (anche superadmin) per qualsiasi ristorante.
// - manager: solo il superadmin;
// - operatori di reparto: il superadmin o il manager di quel ristorante;
// - superadmin: mai da qui.
const RUOLI_OPERATORE: UserRole[] = ['cucina', 'pizzeria', 'bar', 'pasticceria', 'antipasti', 'cassa']

function errore(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const chiamante = await getChiamante(req)
    if (!chiamante) return errore('Non autenticato', 401)

    const { email, password, role, restaurantId, displayName } = await req.json()

    if (role !== 'manager' && !RUOLI_OPERATORE.includes(role)) return errore('Ruolo non valido', 400)
    if (typeof restaurantId !== 'string' || !restaurantId) return errore('Ristorante mancante', 400)
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errore('Email non valida', 400)
    if (typeof password !== 'string' || password.length < 8) return errore('La password deve avere almeno 8 caratteri', 400)
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 100)) {
      return errore('Nome non valido', 400)
    }

    const puoCreare = role === 'manager'
      ? isSuperAdmin(chiamante.utente)
      : puoGestireRistorante(chiamante.utente, restaurantId)
    if (!puoCreare) return errore('Non autorizzato a creare questo utente', 403)

    const app = getAdminApp()
    const adminDb = getFirestore(app)
    if (!(await adminDb.collection('ristoranti').doc(restaurantId).get()).exists) {
      return errore('Ristorante non trovato', 404)
    }

    let uid: string
    try {
      uid = (await getAuth(app).createUser({ email, password, displayName })).uid
    } catch (err: any) {
      if (err?.code === 'auth/email-already-exists') return errore('Esiste già un account con questa email', 409)
      if (err?.code === 'auth/invalid-password') return errore('Password non valida', 400)
      throw err
    }

    const utente: AppUser = {
      uid,
      email,
      role,
      restaurantId,
      displayName: displayName || '',
      createdAt: new Date().toISOString(),
    }
    try {
      await adminDb.collection('utenti').doc(uid).set(utente)
    } catch (err) {
      // Senza profilo l'account non servirebbe a niente e bloccherebbe l'email: lo si rimuove
      await getAuth(app).deleteUser(uid).catch(() => {})
      throw err
    }
    return NextResponse.json({ success: true, uid })
  } catch (err) {
    console.error('ERRORE CREAZIONE UTENTE:', err)
    return errore('Errore nella creazione dell\'utente', 500)
  }
}
