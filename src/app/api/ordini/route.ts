export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import type { Ordine, RigaOrdine } from '@/types'

// Creazione ordine del cliente. Le regole Firestore non permettono più al
// client di scrivere sugli ordini: qui l'ordine viene costruito da zero con
// prezzi, nomi e reparti letti dal menu, e lo stato iniziale deciso dal server
// (un ordine online nasce sempre "in_attesa_pagamento").
const METODI = ['cassa', 'stripe', 'paypal'] as const
const MAX_RIGHE = 50
const MAX_QUANTITA = 99
const MAX_NOTE = 200

interface RigaRichiesta { piattoId: string; quantita: number; note?: string }

function erroreRichiesta(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, tavoloId, metodoPagamento, righe } = await req.json()

    if (typeof restaurantId !== 'string' || !restaurantId || typeof tavoloId !== 'string' || !tavoloId) {
      return erroreRichiesta('Parametri mancanti')
    }
    if (!METODI.includes(metodoPagamento)) return erroreRichiesta('Metodo di pagamento non valido')
    if (!Array.isArray(righe) || righe.length === 0 || righe.length > MAX_RIGHE) {
      return erroreRichiesta('Ordine senza righe valide')
    }
    for (const r of righe as RigaRichiesta[]) {
      if (typeof r?.piattoId !== 'string' || !r.piattoId) return erroreRichiesta('Piatto non valido')
      if (!Number.isInteger(r.quantita) || r.quantita < 1 || r.quantita > MAX_QUANTITA) {
        return erroreRichiesta('Quantità non valida')
      }
      if (r.note !== undefined && typeof r.note !== 'string') return erroreRichiesta('Note non valide')
    }

    const adminDb = getFirestore(getAdminApp())
    const ristoranteRef = adminDb.collection('ristoranti').doc(restaurantId)

    const [ristoranteSnap, tavoloSnap, configSnap] = await Promise.all([
      ristoranteRef.get(),
      ristoranteRef.collection('tavoli').doc(tavoloId).get(),
      ristoranteRef.collection('config').doc('pagamenti').get(),
    ])
    if (!ristoranteSnap.exists || ristoranteSnap.data()?.attivo === false) {
      return erroreRichiesta('Ristorante non trovato', 404)
    }
    if (!tavoloSnap.exists) return erroreRichiesta('Tavolo non trovato', 404)

    // Stessa logica dei metodi mostrati al cliente in MenuPubblicoClient
    const config = configSnap.data()
    if (metodoPagamento === 'cassa') {
      if (config && config.pagaInCassa?.abilitato === false) return erroreRichiesta('Pagamento in cassa non disponibile')
    } else if (!config?.abilitaPagamentiOnline || !config?.[metodoPagamento]?.abilitato) {
      return erroreRichiesta('Metodo di pagamento non disponibile')
    }

    const piattoIds = Array.from(new Set((righe as RigaRichiesta[]).map(r => r.piattoId)))
    const piattiSnaps = await adminDb.getAll(...piattoIds.map(id => ristoranteRef.collection('piatti').doc(id)))
    const piatti = new Map(piattiSnaps.map(s => [s.id, s]))

    const righeOrdine: RigaOrdine[] = []
    for (const r of righe as RigaRichiesta[]) {
      const p = piatti.get(r.piattoId)?.data()
      if (!p || p.disponibile === false) return erroreRichiesta('Un piatto non è più disponibile')
      if (typeof p.prezzo !== 'number' || !Number.isFinite(p.prezzo) || p.prezzo < 0) {
        return erroreRichiesta('Prezzo non valido nel menu')
      }
      righeOrdine.push({
        piattoId: r.piattoId, nome: p.nome, prezzo: p.prezzo, quantita: r.quantita,
        reparto: p.reparto, note: (r.note || '').trim().slice(0, MAX_NOTE), stato: 'ricevuto',
      })
    }
    // Arrotonda a 2 decimali per evitare errori di floating point sui centesimi
    const totale = Math.round(righeOrdine.reduce((s, r) => s + r.prezzo * r.quantita, 0) * 100) / 100

    const ordineRef = ristoranteRef.collection('ordini').doc()
    const adesso = new Date().toISOString()
    const ordine: Ordine = {
      id: ordineRef.id,
      tavoloId,
      tavoloNumero: tavoloSnap.data()?.numero ?? 0,
      righe: righeOrdine,
      totale,
      stato: metodoPagamento === 'cassa' ? 'ricevuto' : 'in_attesa_pagamento',
      metodoPagamento,
      createdAt: adesso,
      updatedAt: adesso,
    }

    const batch = adminDb.batch()
    batch.set(ordineRef, ordine)
    batch.update(tavoloSnap.ref, { stato: 'occupato' })
    await batch.commit()

    return NextResponse.json({ success: true, ordine })
  } catch (err) {
    console.error('ERRORE CREAZIONE ORDINE:', err)
    return NextResponse.json({ success: false, error: 'Errore nella creazione dell\'ordine' }, { status: 500 })
  }
}
