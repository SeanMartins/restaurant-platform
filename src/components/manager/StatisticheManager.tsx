'use client'
import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Ordine } from '@/types'

interface Stats {
  fatturatoOggi: number
  fatturatoSettimana: number
  ordiniOggi: number
  tavoliServiti: number
  piattiTop: { nome: string; quantita: number; fatturato: number }[]
  ordiniPerOra: { ora: string; count: number }[]
}

export default function StatisticheManager({ ristorante }: { ristorante: Ristorante }) {
  const [stats, setStats]     = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'oggi' | 'settimana' | 'mese'>('oggi')

  useEffect(() => { caricaStats() }, [ristorante.id, periodo])

  const caricaStats = async () => {
    setLoading(true)
    try {
      const now = new Date()
      const inizioOggi = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const inizioSettimana = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const inizioMese = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const inizioPeriodo = periodo === 'oggi' ? inizioOggi : periodo === 'settimana' ? inizioSettimana : inizioMese

      const q = query(
        collection(db, 'ristoranti', ristorante.id, 'ordini'),
        where('createdAt', '>=', inizioPeriodo),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      const ordini = snap.docs.map(d => d.data() as Ordine)

      // Fatturato
      const fatturatoTotale = ordini.reduce((s, o) => s + o.totale, 0)

      // Ordini di oggi per il confronto
      const ordiniOggi = ordini.filter(o => o.createdAt >= inizioOggi)
      const fatturatoOggi = ordiniOggi.reduce((s, o) => s + o.totale, 0)

      // Tavoli unici serviti
      const tavoliUnici = new Set(ordini.map(o => o.tavoloId)).size

      // Piatti più ordinati
      const piattiMap: Record<string, { nome: string; quantita: number; fatturato: number }> = {}
      ordini.forEach(o => {
        o.righe.forEach(r => {
          if (!piattiMap[r.nome]) piattiMap[r.nome] = { nome: r.nome, quantita: 0, fatturato: 0 }
          piattiMap[r.nome].quantita += r.quantita
          piattiMap[r.nome].fatturato += r.prezzo * r.quantita
        })
      })
      const piattiTop = Object.values(piattiMap)
        .sort((a, b) => b.quantita - a.quantita)
        .slice(0, 8)

      // Ordini per ora (solo oggi)
      const oreMap: Record<string, number> = {}
      ordiniOggi.forEach(o => {
        const ora = new Date(o.createdAt).getHours()
        const label = `${ora}:00`
        oreMap[label] = (oreMap[label] || 0) + 1
      })
      const ordiniPerOra = Object.entries(oreMap)
        .map(([ora, count]) => ({ ora, count }))
        .sort((a, b) => parseInt(a.ora) - parseInt(b.ora))

      setStats({
        fatturatoOggi,
        fatturatoSettimana: fatturatoTotale,
        ordiniOggi: ordiniOggi.length,
        tavoliServiti: tavoliUnici,
        piattiTop,
        ordiniPerOra
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const maxOrdini = stats?.ordiniPerOra.reduce((m, o) => Math.max(m, o.count), 0) || 1

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div>
      {/* Selezione periodo */}
      <div className="flex gap-2 mb-6">
        {(['oggi', 'settimana', 'mese'] as const).map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
              periodo === p ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            {p === 'oggi' ? 'Oggi' : p === 'settimana' ? 'Ultimi 7 giorni' : 'Questo mese'}
          </button>
        ))}
      </div>

      {/* Metriche principali */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Fatturato', value: `€ ${(stats?.fatturatoSettimana || 0).toFixed(2)}`, icon: '💰', color: 'bg-green-50 border-green-100' },
          { label: 'Ordini', value: stats?.ordiniOggi || 0, icon: '📋', color: 'bg-blue-50 border-blue-100' },
          { label: 'Tavoli serviti', value: stats?.tavoliServiti || 0, icon: '🪑', color: 'bg-orange-50 border-orange-100' },
          { label: 'Scontrino medio', value: `€ ${stats?.ordiniOggi ? ((stats.fatturatoSettimana / (stats.ordiniOggi || 1)).toFixed(2)) : '0.00'}`, icon: '🧾', color: 'bg-purple-50 border-purple-100' },
        ].map((m, i) => (
          <div key={i} className={`rounded-2xl border p-5 ${m.color}`}>
            <p className="text-2xl mb-2">{m.icon}</p>
            <p className="text-2xl font-bold text-gray-800">{m.value}</p>
            <p className="text-sm text-gray-500 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Piatti più venduti */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Piatti più ordinati</h3>
          {stats?.piattiTop.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Nessun ordine nel periodo</p>
          ) : (
            <div className="flex flex-col gap-3">
              {stats?.piattiTop.map((p, i) => (
                <div key={p.nome} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-red-400 flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 truncate">{p.nome}</span>
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">x{p.quantita}</span>
                    </div>
                    {/* Barra progresso */}
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-400 transition-all"
                        style={{ width: `${(p.quantita / (stats.piattiTop[0]?.quantita || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 flex-shrink-0 w-16 text-right">
                    € {p.fatturato.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Andamento ordini per ora */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Ordini per ora (oggi)</h3>
          {!stats?.ordiniPerOra.length ? (
            <p className="text-gray-400 text-sm text-center py-8">Nessun ordine oggi</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {stats.ordiniPerOra.map(o => (
                <div key={o.ora} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-gray-600">{o.count}</span>
                  <div className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${(o.count / maxOrdini) * 120}px`,
                      background: 'var(--brand-primary, #E63946)',
                      minHeight: '4px'
                    }}
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">{o.ora}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nota aggiornamento */}
      <p className="text-xs text-gray-400 text-center mt-6">
        Dati aggiornati in tempo reale · {new Date().toLocaleString('it-IT')}
      </p>
    </div>
  )
}
