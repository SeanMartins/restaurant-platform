export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { leggiBilling } from '@/lib/billing'
import { getChiamante, isSuperAdmin } from '@/lib/auth-server'
import type { BillingRistorante } from '@/types'

// Gestione manuale della fatturazione (es. piloti gratuiti di 3 mesi).
// Solo superadmin: config/billing non è scrivibile da nessun client, nemmeno
// dal superadmin, quindi passa da qui con le credenziali Admin.
const PIANI = ['base', 'pro']
const STATI = ['attivo', 'scaduto', 'cancellato']

async function verificaSuperAdmin(req: NextRequest) {
  return isSuperAdmin((await getChiamante(req))?.utente)
}

function dataValida(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

export async function GET(req: NextRequest) {
  if (!(await verificaSuperAdmin(req))) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 })
  }
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return NextResponse.json({ success: false, error: 'Parametri mancanti' }, { status: 400 })

  try {
    const billing = await leggiBilling(getFirestore(getAdminApp()), restaurantId)
    return NextResponse.json({ success: true, billing })
  } catch (err) {
    console.error('ERRORE LETTURA BILLING:', err)
    return NextResponse.json({ success: false, error: 'Errore nella lettura' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await verificaSuperAdmin(req))) {
    return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 })
  }

  try {
    const { restaurantId, piano, statoAbbonamento, scadenza } = await req.json()
    if (typeof restaurantId !== 'string' || !restaurantId) {
      return NextResponse.json({ success: false, error: 'Parametri mancanti' }, { status: 400 })
    }
    if (!PIANI.includes(piano)) return NextResponse.json({ success: false, error: 'Piano non valido' }, { status: 400 })
    if (!STATI.includes(statoAbbonamento)) {
      return NextResponse.json({ success: false, error: 'Stato abbonamento non valido' }, { status: 400 })
    }
    if (scadenza !== null && scadenza !== undefined && scadenza !== '' && !dataValida(scadenza)) {
      return NextResponse.json({ success: false, error: 'Scadenza non valida' }, { status: 400 })
    }

    const adminDb = getFirestore(getAdminApp())
    const ristoranteRef = adminDb.collection('ristoranti').doc(restaurantId)
    if (!(await ristoranteRef.get()).exists) {
      return NextResponse.json({ success: false, error: 'Ristorante non trovato' }, { status: 404 })
    }

    // Parte dai dati attuali (anche quelli non ancora migrati dal documento
    // ristorante) per non perdere gli ID Stripe.
    const attuale = await leggiBilling(adminDb, restaurantId)
    const billing: BillingRistorante = {
      ...attuale,
      piano,
      statoAbbonamento,
      scadenza: scadenza || null,
      updatedAt: new Date().toISOString(),
    }
    await ristoranteRef.collection('config').doc('billing').set(billing)

    return NextResponse.json({ success: true, billing })
  } catch (err) {
    console.error('ERRORE SALVATAGGIO BILLING:', err)
    return NextResponse.json({ success: false, error: 'Errore nel salvataggio' }, { status: 500 })
  }
}
