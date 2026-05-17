'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { getRistorante } from '@/lib/firestore'
import type { Ristorante } from '@/types'
import MenuManager from '@/components/manager/MenuManager'
import TavoliManager from '@/components/manager/TavoliManager'
import GraficaManager from '@/components/manager/GraficaManager'
import OperatoriManager from '@/components/manager/OperatoriManager'
import StatisticheManager from '@/components/manager/StatisticheManager'

type Sezione = 'statistiche' | 'menu' | 'tavoli' | 'grafica' | 'operatori'

export default function DashboardPage() {
  const { appUser, loading, logout } = useAuth()
  const router = useRouter()
  const [ristorante, setRistorante] = useState<Ristorante | null>(null)
  const [sezione, setSezione]       = useState<Sezione>('statistiche')
  const [loadingDati, setLoadingDati] = useState(true)

  useEffect(() => {
    if (!loading && appUser?.role !== 'manager') router.replace('/login')
  }, [appUser, loading, router])

  useEffect(() => {
    if (appUser?.restaurantId) {
      getRistorante(appUser.restaurantId).then(r => {
        setRistorante(r)
        setLoadingDati(false)
      })
    }
  }, [appUser])

  if (loading || loadingDati) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!ristorante) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Ristorante non trovato</p>
    </div>
  )

  const voci = [
    { id: 'statistiche', label: 'Statistiche', emoji: '📊' },
    { id: 'menu',        label: 'Menu',         emoji: '📋' },
    { id: 'tavoli',      label: 'Tavoli & QR',  emoji: '🪑' },
    { id: 'grafica',     label: 'Grafica',       emoji: '🎨' },
    { id: 'operatori',   label: 'Operatori',     emoji: '👥' },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: ristorante.colori.primario }}>
              {ristorante.nome.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="font-bold text-gray-800">{ristorante.nome}</h1>
              <p className="text-xs text-gray-500">/{ristorante.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href={`/${ristorante.slug}`} target="_blank"
              className="text-sm text-blue-500 hover:underline">
              Vedi menu pubblico ↗
            </a>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-red-500">Esci</button>
          </div>
        </div>
      </header>

      {/* Navigazione */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {voci.map(v => (
              <button key={v.id} onClick={() => setSezione(v.id)}
                className={`px-5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  sezione === v.id
                    ? 'border-red-500 text-red-500'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {v.emoji} {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenuto */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {sezione === 'statistiche' && <StatisticheManager ristorante={ristorante} />}
        {sezione === 'menu'        && <MenuManager ristorante={ristorante} />}
        {sezione === 'tavoli'      && <TavoliManager ristorante={ristorante} />}
        {sezione === 'grafica'     && <GraficaManager ristorante={ristorante} onAggiorna={setRistorante} />}
        {sezione === 'operatori'   && <OperatoriManager ristorante={ristorante} />}
      </div>
    </div>
  )
}
