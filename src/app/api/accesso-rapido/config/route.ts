export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { hashPin, pinValido } from '@/lib/pin-hash'
import { getChiamante, puoGestireRistorante } from '@/lib/auth-server'

// Salvataggio della configurazione dell'accesso rapido (manager del
// ristorante o superadmin). Il PIN arriva in chiaro solo qui e viene salvato
// come hash: le regole Firestore non permettono più di scrivere
// config/accesso-rapido dal client.
const REPARTI = ['cucina', 'pizzeria', 'bar', 'pasticceria', 'antipasti', 'cassa']

export async function POST(req: NextRequest) {
  try {
    const app = getAdminApp()
    const adminAuth = getAuth(app)
    const adminDb = getFirestore(app)

    const chiamante = await getChiamante(req)
    if (!chiamante) return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })

    const { restaurantId, abilitato, tipo, password } = await req.json()
    if (typeof restaurantId !== 'string' || !restaurantId || typeof abilitato !== 'boolean' || !['pin', 'testo'].includes(tipo)) {
      return NextResponse.json({ success: false, error: 'Parametri non validi' }, { status: 400 })
    }

    if (!puoGestireRistorante(chiamante.utente, restaurantId)) return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 })

    const configRef = adminDb.collection('ristoranti').doc(restaurantId).collection('config').doc('accesso-rapido')
    const attuale = (await configRef.get()).data()
    const nuovaPassword = typeof password === 'string' && password !== '' ? password : null

    if (nuovaPassword !== null && !pinValido(tipo, nuovaPassword)) {
      return NextResponse.json({
        success: false,
        error: tipo === 'pin' ? 'Il PIN deve avere 6 cifre' : 'La password deve avere almeno 8 caratteri',
      }, { status: 400 })
    }
    // Senza un nuovo valore si può tenere quello salvato solo se è dello stesso tipo
    const haGiaPassword = !!(attuale?.passwordHash || attuale?.password)
    if (abilitato && nuovaPassword === null && (!haGiaPassword || attuale?.tipo !== tipo)) {
      return NextResponse.json({
        success: false, error: tipo === 'pin' ? 'Imposta un PIN di 6 cifre' : 'Imposta una password',
      }, { status: 400 })
    }

    await configRef.set({
      abilitato,
      tipo,
      ...(nuovaPassword !== null ? { passwordHash: hashPin(nuovaPassword), password: FieldValue.delete() } : {}),
      aggiornatoIl: new Date().toISOString(),
    }, { merge: true })

    // PIN cambiato o accesso disabilitato: le schede già aperte con il vecchio
    // accesso perdono la sessione al prossimo rinnovo del token (entro un'ora)
    if (nuovaPassword !== null || !abilitato) {
      await Promise.all(REPARTI.map(r =>
        adminAuth.revokeRefreshTokens(`rapido_${restaurantId}_${r}`).catch(() => {})
      ))
    }

    return NextResponse.json({ success: true, impostata: nuovaPassword !== null || haGiaPassword })
  } catch (err) {
    console.error('ERRORE CONFIG ACCESSO RAPIDO:', err)
    return NextResponse.json({ success: false, error: 'Errore nel salvataggio' }, { status: 500 })
  }
}
