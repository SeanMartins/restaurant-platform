'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import type { PianoId } from '@/lib/stripe'

const FEATURES_COMUNI = [
  'Menu digitale via QR — zero app da scaricare',
  'Dashboard in tempo reale per ogni reparto',
  'Cassa con conto per tavolo',
  'Pagamento in cassa o online (carta, PayPal)',
  'Grafica personalizzata (colori, font, nome)',
  'Staff con accesso rapido via PIN',
  'Statistiche con export Excel e PDF',
  'Tavoli e QR illimitati',
]

const PIANI = [
  { id: 'base' as PianoId, nome: 'Base', prezzo: '79', descrizione: 'Tutto il necessario per iniziare a ricevere ordini digitali.' },
  { id: 'pro'  as PianoId, nome: 'Pro',  prezzo: '129', descrizione: 'Come Base, con supporto prioritario e onboarding assistito.', evidenziato: true },
]

export default function PricingCards() {
  const [caricamento, setCaricamento] = useState<PianoId | null>(null)

  const acquista = async (piano: PianoId) => {
    setCaricamento(piano)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piano }),
      })
      const dati = await res.json()
      if (!dati.success) throw new Error(dati.error)
      window.location.href = dati.url
    } catch (err: any) {
      toast.error(err.message || 'Errore durante il checkout')
      setCaricamento(null)
    }
  }

  return (
    <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
      {PIANI.map(p => (
        <div key={p.id}
          className={`rounded-2xl p-8 flex flex-col ${
            p.evidenziato ? 'bg-white border-2 border-red-500 shadow-lg shadow-red-100 relative' : 'bg-white border border-gray-200'
          }`}>
          {p.evidenziato && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
              Consigliato
            </span>
          )}
          <h3 className="text-xl font-semibold text-gray-900">{p.nome}</h3>
          <p className="text-gray-500 mt-1 mb-6 text-sm">{p.descrizione}</p>
          <p className="text-4xl font-bold text-gray-900 mb-6">
            €{p.prezzo}<span className="text-base font-normal text-gray-500">/mese</span>
          </p>
          <ul className="flex flex-col gap-2.5 mb-8 flex-1">
            {FEATURES_COMUNI.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-green-500 font-bold mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => acquista(p.id)}
            disabled={caricamento !== null}
            className={`py-3 rounded-xl font-medium transition disabled:opacity-50 ${
              p.evidenziato ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'
            }`}
          >
            {caricamento === p.id ? 'Attendere...' : 'Inizia ora'}
          </button>
        </div>
      ))}
    </div>
  )
}
