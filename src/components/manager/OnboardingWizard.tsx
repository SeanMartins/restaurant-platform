'use client'
import { useState } from 'react'
import { aggiornaRistorante } from '@/lib/firestore'
import type { Ristorante } from '@/types'
import toast from 'react-hot-toast'
import MenuManager from '@/components/manager/MenuManager'
import TavoliManager from '@/components/manager/TavoliManager'

const PASSI = [
  { label: 'Il tuo ristorante', emoji: '🏪' },
  { label: 'Menu',              emoji: '📋' },
  { label: 'Tavoli & QR',       emoji: '🪑' },
] as const

export default function OnboardingWizard({
  ristorante, onCompletato
}: {
  ristorante: Ristorante
  onCompletato: (r: Ristorante) => void
}) {
  const [passo, setPasso] = useState(0)
  const [nome, setNome]   = useState(ristorante.nome)
  const [colorePrimario, setColorePrimario] = useState(ristorante.colori.primario)
  const [salvando, setSalvando] = useState(false)

  const salvaEContinua = async () => {
    if (!nome.trim()) { toast.error('Inserisci il nome del ristorante'); return }
    setSalvando(true)
    try {
      const colori = { ...ristorante.colori, primario: colorePrimario }
      await aggiornaRistorante(ristorante.id, { nome, colori })
      onCompletato({ ...ristorante, nome, colori })
      setPasso(1)
    } catch { toast.error('Errore nel salvataggio') }
    finally { setSalvando(false) }
  }

  const completaOnboarding = async () => {
    setSalvando(true)
    try {
      await aggiornaRistorante(ristorante.id, { onboardingCompletato: true })
      toast.success('Tutto pronto! Benvenuto su Comanda 🎉')
      onCompletato({ ...ristorante, nome, onboardingCompletato: true })
    } catch { toast.error('Errore nel salvataggio') }
    finally { setSalvando(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header con progress */}
      <header className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-bold text-gray-800 text-lg mb-1">Configuriamo il tuo ristorante</h1>
          <p className="text-sm text-gray-500 mb-4">Bastano pochi minuti — puoi sempre modificare tutto in seguito.</p>
          <div className="flex items-center gap-2">
            {PASSI.map((p, i) => (
              <div key={p.label} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  i < passo ? 'bg-green-500 text-white' : i === passo ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {i < passo ? '✓' : p.emoji}
                </div>
                <span className={`text-sm font-medium hidden sm:inline ${i === passo ? 'text-gray-800' : 'text-gray-400'}`}>
                  {p.label}
                </span>
                {i < PASSI.length - 1 && <div className={`h-0.5 flex-1 ${i < passo ? 'bg-green-500' : 'bg-gray-100'}`} />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* PASSO 0 — Nome e colore */}
        {passo === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md mx-auto">
            <p className="text-4xl mb-4">🏪</p>
            <h2 className="font-bold text-gray-800 text-xl mb-1">Come si chiama il tuo ristorante?</h2>
            <p className="text-sm text-gray-500 mb-6">Comparirà nel menu che i tuoi clienti vedranno dal telefono.</p>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome ristorante</label>
                <input value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="es. Trattoria Da Mario"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colore principale</label>
                <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2">
                  <input type="color" value={colorePrimario} onChange={e => setColorePrimario(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"/>
                  <span className="text-sm text-gray-500">Usato per pulsanti e accenti nel menu. Puoi affinare tutta la grafica dopo.</span>
                </div>
              </div>
              <button onClick={salvaEContinua} disabled={salvando}
                className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-semibold mt-2">
                {salvando ? 'Salvataggio...' : 'Continua →'}
              </button>
            </div>
          </div>
        )}

        {/* PASSO 1 — Menu */}
        {passo === 1 && (
          <div>
            <div className="mb-6">
              <h2 className="font-bold text-gray-800 text-xl mb-1">Aggiungi il tuo menu</h2>
              <p className="text-sm text-gray-500">Crea almeno una categoria e un piatto — potrai aggiungerne altri quando vuoi.</p>
            </div>
            <MenuManager ristorante={ristorante} />
            <div className="flex justify-end mt-6 max-w-md ml-auto gap-3">
              <button onClick={() => setPasso(2)}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold">
                Continua →
              </button>
            </div>
          </div>
        )}

        {/* PASSO 2 — Tavoli */}
        {passo === 2 && (
          <div>
            <div className="mb-6">
              <h2 className="font-bold text-gray-800 text-xl mb-1">Crea i tuoi tavoli</h2>
              <p className="text-sm text-gray-500">Ogni tavolo ha un QR code univoco che i clienti scansionano per ordinare.</p>
            </div>
            <TavoliManager ristorante={ristorante} />
            <div className="flex justify-end mt-6 gap-3">
              <button onClick={completaOnboarding} disabled={salvando}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-semibold">
                {salvando ? 'Un attimo...' : 'Fine, vai alla dashboard →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
