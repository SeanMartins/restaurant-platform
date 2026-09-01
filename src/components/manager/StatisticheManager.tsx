'use client'
import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Ordine } from '@/types'

interface Stats {
  fatturatoTotale: number
  ordiniTotali: number
  tavoliServiti: number
  scontrinoMedio: number
  piattiTop: { nome: string; quantita: number; fatturato: number }[]
  ordiniPerOra: { ora: string; count: number }[]
  tuttiOrdini: Ordine[]
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
      const inizioOggi      = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const inizioSettimana = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const inizioMese      = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const inizioPeriodo   = periodo === 'oggi' ? inizioOggi : periodo === 'settimana' ? inizioSettimana : inizioMese

      const q = query(
        collection(db, 'ristoranti', ristorante.id, 'ordini'),
        where('createdAt', '>=', inizioPeriodo),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      const ordini = snap.docs.map(d => d.data() as Ordine)

      const fatturatoTotale = ordini.reduce((s, o) => s + o.totale, 0)
      const tavoliUnici     = new Set(ordini.map(o => o.tavoloId)).size
      const scontrinoMedio  = ordini.length ? fatturatoTotale / ordini.length : 0

      const piattiMap: Record<string, { nome: string; quantita: number; fatturato: number }> = {}
      ordini.forEach(o => {
        o.righe.forEach(r => {
          if (!piattiMap[r.nome]) piattiMap[r.nome] = { nome: r.nome, quantita: 0, fatturato: 0 }
          piattiMap[r.nome].quantita += r.quantita
          piattiMap[r.nome].fatturato += r.prezzo * r.quantita
        })
      })
      const piattiTop = Object.values(piattiMap).sort((a, b) => b.quantita - a.quantita).slice(0, 8)

      const oreMap: Record<string, number> = {}
      ordini.forEach(o => {
        const label = `${new Date(o.createdAt).getHours()}:00`
        oreMap[label] = (oreMap[label] || 0) + 1
      })
      const ordiniPerOra = Object.entries(oreMap)
        .map(([ora, count]) => ({ ora, count }))
        .sort((a, b) => parseInt(a.ora) - parseInt(b.ora))

      setStats({ fatturatoTotale, ordiniTotali: ordini.length, tavoliServiti: tavoliUnici, scontrinoMedio, piattiTop, ordiniPerOra, tuttiOrdini: ordini })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // ── EXPORT EXCEL ────────────────────────────────────────────────────────────
  const esportaExcel = () => {
    if (!stats) return
    const periodoLabel = periodo === 'oggi' ? 'Oggi' : periodo === 'settimana' ? 'Ultimi 7 giorni' : 'Questo mese'

    // Costruisci CSV
    const righe = [
      [`Ristorante: ${ristorante.nome}`],
      [`Periodo: ${periodoLabel}`],
      [`Esportato il: ${new Date().toLocaleString('it-IT')}`],
      [],
      ['RIEPILOGO'],
      ['Fatturato totale', `€ ${stats.fatturatoTotale.toFixed(2)}`],
      ['Numero ordini', stats.ordiniTotali],
      ['Tavoli serviti', stats.tavoliServiti],
      ['Scontrino medio', `€ ${stats.scontrinoMedio.toFixed(2)}`],
      [],
      ['PIATTI PIU ORDINATI'],
      ['Piatto', 'Quantita', 'Fatturato'],
      ...stats.piattiTop.map(p => [p.nome, p.quantita, `€ ${p.fatturato.toFixed(2)}`]),
      [],
      ['DETTAGLIO ORDINI'],
      ['Data/Ora', 'Tavolo', 'Piatti', 'Totale', 'Stato'],
      ...stats.tuttiOrdini.map(o => [
        new Date(o.createdAt).toLocaleString('it-IT'),
        `Tavolo ${o.tavoloNumero}`,
        o.righe.map(r => `${r.quantita}x ${r.nome}`).join(' | '),
        `€ ${o.totale.toFixed(2)}`,
        o.stato
      ])
    ]

    const csv = righe.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const bom  = '\uFEFF' // BOM per Excel italiano
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href     = URL.createObjectURL(blob)
    link.download = `statistiche-${ristorante.slug}-${periodo}.csv`
    link.click()
  }

  // ── EXPORT PDF ──────────────────────────────────────────────────────────────
  const esportaPDF = () => {
    if (!stats) return
    const brandColor  = ristorante.colori.primario || '#E63946'
    const periodoLabel = periodo === 'oggi' ? 'Oggi' : periodo === 'settimana' ? 'Ultimi 7 giorni' : 'Questo mese'

    const piattiHtml = stats.piattiTop.map((p, i) => `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:8px 4px;">${i + 1}. ${p.nome}</td>
        <td style="padding:8px 4px; text-align:center;">${p.quantita}</td>
        <td style="padding:8px 4px; text-align:right; font-weight:600;">€ ${p.fatturato.toFixed(2)}</td>
      </tr>
    `).join('')

    const ordiniHtml = stats.tuttiOrdini.slice(0, 20).map(o => `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:6px 4px; font-size:12px;">${new Date(o.createdAt).toLocaleString('it-IT')}</td>
        <td style="padding:6px 4px; font-size:12px;">T${o.tavoloNumero}</td>
        <td style="padding:6px 4px; font-size:12px;">${o.righe.map(r => `${r.quantita}x ${r.nome}`).join(', ')}</td>
        <td style="padding:6px 4px; font-size:12px; font-weight:600; text-align:right;">€ ${o.totale.toFixed(2)}</td>
      </tr>
    `).join('')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Report ${ristorante.nome}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; color: #333; }
        .header { background: ${brandColor}; color: white; padding: 32px 40px; }
        .header h1 { font-size: 28px; margin-bottom: 6px; }
        .header p { opacity: 0.8; font-size: 14px; }
        .content { padding: 32px 40px; }
        .metriche { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 32px; }
        .metrica { background: #f8f8f8; border-radius: 12px; padding: 16px; text-align: center; }
        .metrica .valore { font-size: 24px; font-weight: bold; color: ${brandColor}; }
        .metrica .label { font-size: 12px; color: #888; margin-top: 4px; }
        h2 { font-size: 18px; margin-bottom: 16px; color: ${brandColor}; border-bottom: 2px solid ${brandColor}; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
        th { text-align: left; padding: 10px 4px; font-size: 13px; color: #888; border-bottom: 2px solid #eee; }
        .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 24px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head>
      <body>
        <div class="header">
          <h1>${ristorante.nome}</h1>
          <p>Report statistiche · ${periodoLabel} · ${new Date().toLocaleDateString('it-IT')}</p>
        </div>
        <div class="content">
          <div class="metriche">
            <div class="metrica"><div class="valore">€ ${stats.fatturatoTotale.toFixed(2)}</div><div class="label">Fatturato</div></div>
            <div class="metrica"><div class="valore">${stats.ordiniTotali}</div><div class="label">Ordini</div></div>
            <div class="metrica"><div class="valore">${stats.tavoliServiti}</div><div class="label">Tavoli serviti</div></div>
            <div class="metrica"><div class="valore">€ ${stats.scontrinoMedio.toFixed(2)}</div><div class="label">Scontrino medio</div></div>
          </div>
          <h2>Piatti più ordinati</h2>
          <table>
            <tr><th>Piatto</th><th style="text-align:center;">Quantità</th><th style="text-align:right;">Fatturato</th></tr>
            ${piattiHtml || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#aaa;">Nessun dato</td></tr>'}
          </table>
          <h2>Ultimi ordini</h2>
          <table>
            <tr><th>Data/Ora</th><th>Tavolo</th><th>Piatti</th><th style="text-align:right;">Totale</th></tr>
            ${ordiniHtml || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#aaa;">Nessun ordine</td></tr>'}
          </table>
          <div class="footer">Report generato da Restaurant Platform · ${new Date().toLocaleString('it-IT')}</div>
        </div>
        <script>window.onload = () => setTimeout(() => window.print(), 300)</script>
      </body></html>
    `)
    win.document.close()
  }

  const maxOrdini = stats?.ordiniPerOra.reduce((m, o) => Math.max(m, o.count), 0) || 1

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-2">
          {(['oggi', 'settimana', 'mese'] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                periodo === p ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}>
              {p === 'oggi' ? 'Oggi' : p === 'settimana' ? 'Ultimi 7 giorni' : 'Questo mese'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={esportaExcel}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
            📊 Esporta Excel
          </button>
          <button onClick={esportaPDF}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
            📄 Esporta PDF
          </button>
        </div>
      </div>

      {/* Metriche */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Fatturato',     value: `€ ${(stats?.fatturatoTotale || 0).toFixed(2)}`, color: 'bg-green-50 border-green-100' },
          { label: 'Ordini',        value: stats?.ordiniTotali || 0,                          color: 'bg-blue-50 border-blue-100' },
          { label: 'Tavoli serviti',value: stats?.tavoliServiti || 0,                          color: 'bg-orange-50 border-orange-100' },
          { label: 'Scontrino medio',value:`€ ${(stats?.scontrinoMedio || 0).toFixed(2)}`,   color: 'bg-purple-50 border-purple-100' },
        ].map((m, i) => (
          <div key={i} className={`rounded-2xl border p-5 ${m.color}`}>
            <p className="text-2xl font-bold text-gray-800 mt-1">{m.value}</p>
            <p className="text-sm text-gray-500 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Piatti top */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Piatti più ordinati</h3>
          {!stats?.piattiTop.length ? (
            <p className="text-gray-400 text-sm text-center py-8">Nessun ordine nel periodo</p>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.piattiTop.map((p, i) => (
                <div key={p.nome} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-red-400 flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 truncate">{p.nome}</span>
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">x{p.quantita}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-400"
                        style={{ width: `${(p.quantita / (stats.piattiTop[0]?.quantita || 1)) * 100}%` }}/>
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

        {/* Grafico per ora */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">
            Ordini per ora ({periodo === 'oggi' ? 'oggi' : periodo === 'settimana' ? 'ultimi 7 giorni' : 'questo mese'})
          </h3>
          {!stats?.ordiniPerOra.length ? (
            <p className="text-gray-400 text-sm text-center py-8">Nessun ordine nel periodo</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {stats.ordiniPerOra.map(o => (
                <div key={o.ora} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-gray-600">{o.count}</span>
                  <div className="w-full rounded-t-lg"
                    style={{ height: `${(o.count / maxOrdini) * 120}px`, background: ristorante.colori.primario || '#E63946', minHeight: '4px' }}/>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{o.ora}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-6">
        Dati aggiornati · {new Date().toLocaleString('it-IT')}
      </p>
    </div>
  )
}
