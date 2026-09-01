'use client'
import { useState } from 'react'
import { aggiornaRistorante } from '@/lib/firestore'
import type { Ristorante } from '@/types'
import toast from 'react-hot-toast'

const FONT_OPTIONS = [
  { value: 'Inter',        label: 'Inter (moderno)' },
  { value: 'Playfair Display', label: 'Playfair (elegante)' },
  { value: 'Roboto',       label: 'Roboto (classico)' },
  { value: 'Lato',         label: 'Lato (pulito)' },
  { value: 'Merriweather', label: 'Merriweather (raffinato)' },
]

export default function GraficaManager({
  ristorante, onAggiorna
}: {
  ristorante: Ristorante
  onAggiorna: (r: Ristorante) => void
}) {
  const [colori, setColori] = useState(ristorante.colori)
  const [font, setFont]     = useState(ristorante.font || 'Inter')
  const [nome, setNome]     = useState(ristorante.nome)
  const [saving, setSaving] = useState(false)

  const salva = async () => {
    setSaving(true)
    try {
      await aggiornaRistorante(ristorante.id, { colori, font, nome })
      onAggiorna({ ...ristorante, colori, font, nome })
      toast.success('Grafica salvata!')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h3 className="font-semibold text-gray-800 mb-5">🎨 Personalizzazione</h3>

        {/* Nome ristorante */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome ristorante</label>
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>

        {/* Colori */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-3">Colori brand</label>
          <div className="grid grid-cols-2 gap-4">
            {([
              { key: 'primario',   label: 'Colore primario',   desc: 'Pulsanti, accenti' },
              { key: 'secondario', label: 'Colore secondario', desc: 'Elementi secondari' },
              { key: 'sfondo',     label: 'Sfondo menu',       desc: 'Sfondo pagina cliente' },
              { key: 'testo',      label: 'Colore testo',      desc: 'Testo principale' },
            ] as const).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl">
                <input
                  type="color"
                  value={colori[key]}
                  onChange={e => setColori(c => ({ ...c, [key]: e.target.value }))}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                  <p className="text-xs font-mono text-gray-400">{colori[key]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Font */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Font menu</label>
          <div className="grid grid-cols-1 gap-2">
            {FONT_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => setFont(f.value)}
                className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                  font === f.value
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
                style={{ fontFamily: f.value }}
              >
                <span className="text-base">{f.label}</span>
                <span className="text-sm text-gray-400 ml-2">— Buongiorno!</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={salva}
          disabled={saving}
          className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-semibold transition-colors"
        >
          {saving ? 'Salvataggio...' : 'Salva modifiche'}
        </button>
      </div>

      {/* Anteprima */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-800 mb-4">👁️ Anteprima menu cliente</h3>
        <div
          className="rounded-xl p-6 border"
          style={{
            backgroundColor: colori.sfondo,
            color: colori.testo,
            fontFamily: font,
            borderColor: colori.primario + '33'
          }}
        >
          <div className="text-center mb-4">
            <div
              className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: colori.primario }}
            >
              {nome.charAt(0)}
            </div>
            <h2 className="text-xl font-bold">{nome}</h2>
            <p className="text-sm opacity-60">Tavolo 1</p>
          </div>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {['🍝 Cucina', '🍕 Pizze', '🍷 Bar'].map(c => (
              <span
                key={c}
                className="px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap"
                style={{ backgroundColor: colori.primario, color: '#fff' }}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {['Spaghetti carbonara — € 12.00', 'Tagliatelle al ragù — € 11.50'].map(p => (
              <div key={p} className="flex justify-between items-center py-2 border-b border-current border-opacity-10">
                <span className="text-sm">{p.split('—')[0]}</span>
                <span className="text-sm font-semibold" style={{ color: colori.primario }}>
                  {p.split('—')[1]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
