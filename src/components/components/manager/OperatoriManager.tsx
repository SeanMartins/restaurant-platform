'use client'
import { useState } from 'react'
import type { Ristorante, UserRole } from '@/types'
import toast from 'react-hot-toast'

const RUOLI: { id: UserRole; label: string; emoji: string; desc: string }[] = [
  { id: 'cucina',      label: 'Cucina',      emoji: '👨‍🍳', desc: 'Vede primi, secondi, contorni' },
  { id: 'pizzeria',    label: 'Pizzeria',     emoji: '🍕', desc: 'Vede solo le pizze' },
  { id: 'bar',         label: 'Bar',          emoji: '🍷', desc: 'Vede bevande e caffè' },
  { id: 'pasticceria', label: 'Pasticceria',  emoji: '🍰', desc: 'Vede dolci e dessert' },
  { id: 'antipasti',   label: 'Antipasti',    emoji: '🥗', desc: 'Vede gli antipasti' },
  { id: 'cassa',       label: 'Cassa',        emoji: '💰', desc: 'Vede tutto, gestisce il conto' },
]

export default function OperatoriManager({ ristorante }: { ristorante: Ristorante }) {
  const [form, setForm]       = useState({ email: '', password: '', displayName: '', role: 'cucina' as UserRole })
  const [loading, setLoading] = useState(false)

  const creaOperatore = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/crea-utente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, restaurantId: ristorante.id })
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Operatore ${form.displayName} creato!`)
        setForm({ email: '', password: '', displayName: '', role: 'cucina' })
      } else {
        toast.error(data.error || 'Errore creazione')
      }
    } catch {
      toast.error('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Ruoli disponibili */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {RUOLI.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-2xl mb-1">{r.emoji}</div>
            <div className="font-medium text-gray-800 text-sm">{r.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Form crea operatore */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-800 mb-5">👥 Crea operatore</h3>
        <form onSubmit={creaOperatore} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="es. Marco - Cucina"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="cucina@ristorante.it"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="minimo 6 caratteri"
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ruolo *</label>
            <div className="grid grid-cols-2 gap-2">
              {RUOLI.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: r.id }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
                    form.role === r.id
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-semibold mt-2"
          >
            {loading ? 'Creazione...' : 'Crea operatore'}
          </button>
        </form>

        <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
          <p className="text-xs text-amber-700">
            ⚠️ <strong>Nota:</strong> La creazione operatori richiede il Firebase Admin SDK configurato.
            Segui le istruzioni nel README per aggiungere le variabili <code>FIREBASE_ADMIN_*</code> al tuo <code>.env.local</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
