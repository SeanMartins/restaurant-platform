'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { getRistorante } from '@/lib/firestore'
import { ascoltaOrdiniReparto, aggiornaStatoRiga } from '@/lib/firestore'
import type { Ristorante, Ordine, CategoriaReparto } from '@/types'

interface DashboardRepartoProps {
  reparto: CategoriaReparto
  emoji: string
  label: string
}

export default function DashboardReparto({ reparto, emoji, label }: DashboardRepartoProps) {
  const { appUser, loading, logout } = useAuth()
  const router = useRouter()
  const [ristorante, setRistorante] = useState<Ristorante | null>(null)
  const [ordini, setOrdini]         = useState<Ordine[]>([])
  const [loadingDati, setLoadingDati] = useState(true)
  const [suono, setSuono]           = useState(true)
  const [ultimiOrdini, setUltimiOrdini] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!loading && !appUser) router.replace('/login')
  }, [appUser, loading, router])

  useEffect(() => {
    if (!appUser?.restaurantId) return
    getRistorante(appUser.restaurantId).then(r => {
      setRistorante(r)
      setLoadingDati(false)
    })
  }, [appUser])

  useEffect(() => {
    if (!appUser?.restaurantId) return
    const unsub = ascoltaOrdiniReparto(appUser.restaurantId, reparto, (nuoviOrdini) => {
      // Suono per nuovi ordini
      if (suono && nuoviOrdini.length > 0) {
        nuoviOrdini.forEach(o => {
          if (!ultimiOrdini.has(o.id)) {
            playNotifica()
          }
        })
      }
      setUltimiOrdini(new Set(nuoviOrdini.map(o => o.id)))
      setOrdini(nuoviOrdini)
    })
    return () => unsub()
  }, [appUser, reparto, suono])

  const playNotifica = () => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }

  const segnaPronte = async (ordineId: string, rigaIndex: number) => {
    if (!appUser?.restaurantId) return
    await aggiornaStatoRiga(appUser.restaurantId, ordineId, rigaIndex, 'pronto')
  }

  const ordiniRicevuti     = ordini.filter(o => o.righe.some(r => r.stato === 'ricevuto'))
  const ordiniPreparazione = ordini.filter(o => o.righe.some(r => r.stato === 'in_preparazione'))
  const ordiniPronti       = ordini.filter(o => o.righe.every(r => r.stato === 'pronto'))

  if (loading || loadingDati) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{emoji}</span>
          <div>
            <h1 className="font-bold text-xl">{label}</h1>
            <p className="text-gray-400 text-sm">{ristorante?.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Contatore ordini attivi */}
          {ordini.length > 0 && (
            <div className="bg-yellow-400 text-gray-900 font-bold px-3 py-1 rounded-full text-sm">
              {ordini.length} ordini attivi
            </div>
          )}
          <button
            onClick={() => setSuono(!suono)}
            className={`text-sm px-3 py-1 rounded-lg border transition-colors ${
              suono ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-500'
            }`}
          >
            {suono ? '🔔 Audio on' : '🔕 Audio off'}
          </button>
          <button onClick={logout} className="text-gray-400 hover:text-white text-sm">
            Esci
          </button>
        </div>
      </header>

      {/* Contenuto */}
      <div className="p-6">
        {ordini.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <span className="text-6xl mb-4">{emoji}</span>
            <p className="text-gray-400 text-xl">Nessun ordine in attesa</p>
            <p className="text-gray-600 text-sm mt-2">Gli ordini appariranno qui in tempo reale</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ordini.map(ordine => (
              <div
                key={ordine.id}
                className={`rounded-2xl border-2 p-5 ${
                  ordine.righe.every(r => r.stato === 'pronto')
                    ? 'border-green-500 bg-green-900/20'
                    : ordine.righe.some(r => r.stato === 'in_preparazione')
                    ? 'border-yellow-500 bg-yellow-900/20'
                    : 'border-red-500 bg-red-900/20'
                }`}
              >
                {/* Header ordine */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-white">
                      T{ordine.tavoloNumero}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      ordine.righe.every(r => r.stato === 'pronto')
                        ? 'bg-green-500 text-white'
                        : ordine.righe.some(r => r.stato === 'in_preparazione')
                        ? 'bg-yellow-400 text-gray-900'
                        : 'bg-red-500 text-white'
                    }`}>
                      {ordine.righe.every(r => r.stato === 'pronto')
                        ? '✓ Pronto'
                        : ordine.righe.some(r => r.stato === 'in_preparazione')
                        ? '⏳ In prep.'
                        : '🆕 Nuovo'}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">
                    {new Date(ordine.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Righe ordine */}
                <div className="flex flex-col gap-2">
                  {ordine.righe.map((riga, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        riga.stato === 'pronto'
                          ? 'bg-green-800/40 opacity-60'
                          : 'bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                          riga.stato === 'pronto' ? 'bg-green-500 text-white' : 'bg-gray-600 text-white'
                        }`}>
                          {riga.quantita}
                        </span>
                        <div>
                          <p className={`font-medium ${riga.stato === 'pronto' ? 'line-through text-gray-500' : 'text-white'}`}>
                            {riga.nome}
                          </p>
                          {riga.note && <p className="text-yellow-400 text-xs">{riga.note}</p>}
                        </div>
                      </div>
                      {riga.stato !== 'pronto' && (
                        <button
                          onClick={() => segnaPronte(ordine.id, idx)}
                          className="bg-green-500 hover:bg-green-400 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          ✓ Pronto
                        </button>
                      )}
                      {riga.stato === 'pronto' && (
                        <span className="text-green-400 text-xs font-medium">✓ Fatto</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
