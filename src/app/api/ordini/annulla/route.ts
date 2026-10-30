export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'

// Annullamento ordine da parte del cliente (prima era un deleteDoc dal client).
// L'ID ordine è un auto-ID non indovinabile che conosce solo chi l'ha creato.
// Si può annullare solo:
// - un ordine online non ancora pagato ("in_attesa_pagamento");
// - un ordine "paga in cassa" entro 3 minuti, se nessun reparto l'ha già toccato.
// Un ordine già pagato online non è mai annullabile da qui.
const FINESTRA_ANNULLA_MS = 3 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, ordineId } = await req.json()
    if (typeof restaurantId !== 'string' || !restaurantId || typeof ordineId !== 'string' || !ordineId) {
      return NextResponse.json({ success: false, error: 'Parametri mancanti' }, { status: 400 })
    }

    const adminDb = getFirestore(getAdminApp())
    const ordineRef = adminDb.collection('ristoranti').doc(restaurantId).collection('ordini').doc(ordineId)

    const esito = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ordineRef)
      if (!snap.exists) return 'non-trovato'
      const ordine = snap.data()!

      const inAttesaPagamento = ordine.stato === 'in_attesa_pagamento'
      const cassaAncoraAnnullabile =
        ordine.stato === 'ricevuto'
        && (!ordine.metodoPagamento || ordine.metodoPagamento === 'cassa')
        && Date.now() - new Date(ordine.createdAt).getTime() <= FINESTRA_ANNULLA_MS
        && (ordine.righe || []).every((r: { stato: string }) => r.stato === 'ricevuto')

      if (!inAttesaPagamento && !cassaAncoraAnnullabile) return 'non-annullabile'
      tx.delete(ordineRef)
      return 'ok'
    })

    if (esito === 'non-trovato') return NextResponse.json({ success: false, error: 'Ordine non trovato' }, { status: 404 })
    if (esito === 'non-annullabile') {
      return NextResponse.json({ success: false, error: 'L\'ordine non può più essere annullato' }, { status: 409 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('ERRORE ANNULLAMENTO ORDINE:', err)
    return NextResponse.json({ success: false, error: 'Errore nell\'annullamento' }, { status: 500 })
  }
}
