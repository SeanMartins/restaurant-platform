'use client'
import { useState, useEffect, useRef } from 'react'
import { getTavoli, creaTavolo, aggiornaTavolo } from '@/lib/firestore'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Tavolo } from '@/types'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'

export default function TavoliManager({ ristorante }: { ristorante: Ristorante }) {
  const [tavoli, setTavoli]       = useState<Tavolo[]>([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState({ numero: '', nome: '', posti: '4' })
  const [mostraCrea, setMostraCrea] = useState(false)
  const canvasRefs = useRef<{ [key: string]: HTMLCanvasElement | null }>({})

  useEffect(() => { caricaTavoli() }, [ristorante.id])

  const caricaTavoli = async () => {
    const lista = await getTavoli(ristorante.id)
    setTavoli(lista)
    setLoading(false)
    // Genera QR per ogni tavolo dopo il render
    setTimeout(() => lista.forEach(t => generaQR(t)), 100)
  }

  const getUrlTavolo = (tavolo: Tavolo) =>
    `${process.env.NEXT_PUBLIC_APP_URL}/${ristorante.slug}?tavolo=${tavolo.id}&n=${tavolo.numero}`

  const generaQR = async (tavolo: Tavolo) => {
    const canvas = canvasRefs.current[tavolo.id]
    if (!canvas) return
    await QRCode.toCanvas(canvas, getUrlTavolo(tavolo), {
      width: 160,
      margin: 2,
      color: { dark: ristorante.colori.primario, light: '#FFFFFF' }
    })
  }

  const handleCreaTavolo = async (e: React.FormEvent) => {
    e.preventDefault()
    const numero = parseInt(form.numero)
    if (tavoli.find(t => t.numero === numero)) {
      toast.error(`Tavolo ${numero} esiste già!`)
      return
    }
    try {
      await creaTavolo(ristorante.id, {
        numero,
        nome: form.nome || `Tavolo ${numero}`,
        posti: parseInt(form.posti),
        stato: 'libero'
      })
      toast.success(`Tavolo ${numero} creato!`)
      setForm({ numero: '', nome: '', posti: '4' })
      setMostraCrea(false)
      caricaTavoli()
    } catch {
      toast.error('Errore nella creazione')
    }
  }

  const creaTavoliInBulk = async () => {
    const da  = prompt('Da quale numero?', '1')
    const a   = prompt('A quale numero?', '10')
    if (!da || !a) return
    const numDa = parseInt(da)
    const numA  = parseInt(a)
    if (isNaN(numDa) || isNaN(numA) || numDa > numA) {
      toast.error('Numeri non validi')
      return
    }
    toast.loading('Creazione tavoli...')
    for (let i = numDa; i <= numA; i++) {
      if (!tavoli.find(t => t.numero === i)) {
        await creaTavolo(ristorante.id, {
          numero: i, nome: `Tavolo ${i}`, posti: 4, stato: 'libero'
        })
      }
    }
    toast.dismiss()
    toast.success(`Tavoli ${numDa}-${numA} creati!`)
    caricaTavoli()
  }

  const scaricaQR = (tavolo: Tavolo) => {
    const canvas = canvasRefs.current[tavolo.id]
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `QR-Tavolo-${tavolo.numero}.png`
    link.href = canvas.toDataURL()
    link.click()
    toast.success(`QR Tavolo ${tavolo.numero} scaricato!`)
  }

  const stampaTutti = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const html = `
      <html><head><title>QR Codes - ${ristorante.nome}</title>
      <style>
        body { font-family: sans-serif; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .card { text-align: center; padding: 16px; border: 1px solid #eee; border-radius: 12px; page-break-inside: avoid; }
        .card h3 { margin: 8px 0 4px; font-size: 14px; }
        .card p { margin: 0; font-size: 12px; color: #888; }
        @media print { .grid { grid-template-columns: repeat(4, 1fr); } }
      </style></head><body>
      <h2 style="text-align:center;margin-bottom:24px">${ristorante.nome} — QR Codes Tavoli</h2>
      <div class="grid">
        ${tavoli.map(t => {
          const canvas = canvasRefs.current[t.id]
          const img = canvas ? canvas.toDataURL() : ''
          return `<div class="card">
            <img src="${img}" width="120" height="120" />
            <h3>${t.nome || `Tavolo ${t.numero}`}</h3>
            <p>${t.posti} posti</p>
          </div>`
        }).join('')}
      </div>
      </body></html>
    `
    win.document.write(html)
    win.document.close()
    win.print()
  }

  const eliminaTavolo = async (t: Tavolo) => {
    if (!confirm(`Eliminare ${t.nome}?`)) return
    await deleteDoc(doc(db, 'ristoranti', ristorante.id, 'tavoli', t.id))
    toast.success('Tavolo eliminato')
    caricaTavoli()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div>
      {/* Header azioni */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="font-semibold text-gray-700">
          🪑 Tavoli <span className="text-gray-400 font-normal">({tavoli.length})</span>
        </h2>
        <div className="flex gap-2 flex-wrap">
          {tavoli.length > 0 && (
            <button
              onClick={stampaTutti}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              🖨️ Stampa tutti i QR
            </button>
          )}
          <button
            onClick={creaTavoliInBulk}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            ⚡ Crea in blocco
          </button>
          <button
            onClick={() => setMostraCrea(!mostraCrea)}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium"
          >
            + Nuovo tavolo
          </button>
        </div>
      </div>

      {/* Form nuovo tavolo */}
      {mostraCrea && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 max-w-md">
          <h3 className="font-semibold text-gray-800 mb-4">Nuovo tavolo</h3>
          <form onSubmit={handleCreaTavolo} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero *</label>
                <input
                  type="number" min="1"
                  value={form.numero}
                  onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="1"
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Posti</label>
                <input
                  type="number" min="1"
                  value={form.posti}
                  onChange={e => setForm(f => ({ ...f, posti: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome personalizzato</label>
              <input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="es. Tavolo terrazza"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setMostraCrea(false)}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">
                Annulla
              </button>
              <button type="submit"
                className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium">
                Crea tavolo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Griglia tavoli */}
      {tavoli.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-5xl mb-4">🪑</p>
          <p className="text-gray-500 mb-2">Nessun tavolo ancora</p>
          <p className="text-gray-400 text-sm mb-6">Crea i tavoli singolarmente o usa "Crea in blocco"</p>
          <button onClick={creaTavoliInBulk} className="bg-red-500 text-white px-6 py-3 rounded-xl font-medium">
            ⚡ Crea tavoli in blocco
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {tavoli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <canvas
                ref={el => { canvasRefs.current[t.id] = el }}
                className="mx-auto rounded-lg"
                style={{ width: 140, height: 140 }}
              />
              <h3 className="font-semibold text-gray-800 mt-3 text-sm">{t.nome || `Tavolo ${t.numero}`}</h3>
              <p className="text-xs text-gray-400 mb-3">{t.posti} posti</p>
              <div className="flex gap-1">
                <button
                  onClick={() => scaricaQR(t)}
                  className="flex-1 text-xs py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                >
                  ⬇️ Scarica
                </button>
                <button
                  onClick={() => eliminaTavolo(t)}
                  className="text-xs py-1.5 px-2 text-red-400 hover:text-red-500 rounded-lg"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
