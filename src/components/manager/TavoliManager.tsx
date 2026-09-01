'use client'
import { useState, useEffect, useRef } from 'react'
import { getTavoli, creaTavolo } from '@/lib/firestore'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Tavolo } from '@/types'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'

export default function TavoliManager({ ristorante }: { ristorante: Ristorante }) {
  const [tavoli, setTavoli]         = useState<Tavolo[]>([])
  const [loading, setLoading]       = useState(true)
  const [form, setForm]             = useState({ numero: '', nome: '', posti: '4' })
  const [mostraCrea, setMostraCrea] = useState(false)
  const canvasRefs = useRef<{ [key: string]: HTMLCanvasElement | null }>({})

  useEffect(() => { caricaTavoli() }, [ristorante.id])

  const caricaTavoli = async () => {
    const lista = await getTavoli(ristorante.id)
    setTavoli(lista)
    setLoading(false)
    setTimeout(() => lista.forEach(t => generaQR(t)), 100)
  }

  const getUrlTavolo = (tavolo: Tavolo) =>
    `${process.env.NEXT_PUBLIC_APP_URL}/${ristorante.slug}?tavolo=${tavolo.id}&n=${tavolo.numero}`

  const generaQR = async (tavolo: Tavolo) => {
    const canvas = canvasRefs.current[tavolo.id]
    if (!canvas) return
    await QRCode.toCanvas(canvas, getUrlTavolo(tavolo), {
      width: 160, margin: 2,
      color: { dark: ristorante.colori.primario || '#000000', light: '#FFFFFF' }
    })
  }

  const handleCreaTavolo = async (e: React.FormEvent) => {
    e.preventDefault()
    const numero = parseInt(form.numero)
    if (tavoli.find(t => t.numero === numero)) { toast.error(`Tavolo ${numero} esiste già!`); return }
    try {
      await creaTavolo(ristorante.id, {
        numero, nome: form.nome || `Tavolo ${numero}`,
        posti: parseInt(form.posti), stato: 'libero'
      })
      toast.success(`Tavolo ${numero} creato!`)
      setForm({ numero: '', nome: '', posti: '4' })
      setMostraCrea(false)
      caricaTavoli()
    } catch { toast.error('Errore nella creazione') }
  }

  const creaTavoliInBulk = async () => {
    const da = prompt('Da quale numero?', '1')
    const a  = prompt('A quale numero?', '10')
    if (!da || !a) return
    const numDa = parseInt(da), numA = parseInt(a)
    if (isNaN(numDa) || isNaN(numA) || numDa > numA) { toast.error('Numeri non validi'); return }
    toast.loading('Creazione tavoli...')
    for (let i = numDa; i <= numA; i++) {
      if (!tavoli.find(t => t.numero === i))
        await creaTavolo(ristorante.id, { numero: i, nome: `Tavolo ${i}`, posti: 4, stato: 'libero' })
    }
    toast.dismiss()
    toast.success(`Tavoli ${numDa}-${numA} creati!`)
    caricaTavoli()
  }

  // Genera QR card professionale come canvas
  const generaQRCard = async (tavolo: Tavolo): Promise<HTMLCanvasElement> => {
    const brandColor = ristorante.colori.primario || '#E63946'
    const canvas = document.createElement('canvas')
    canvas.width = 400; canvas.height = 500
    const ctx = canvas.getContext('2d')!

    // Sfondo bianco con bordi arrotondati
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.roundRect(0, 0, 400, 500, 20)
    ctx.fill()

    // Header colorato
    ctx.fillStyle = brandColor
    ctx.beginPath()
    ctx.roundRect(0, 0, 400, 130, [20, 20, 0, 0])
    ctx.fill()

    // Nome ristorante
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 26px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(ristorante.nome, 200, 58)

    // Nome tavolo
    ctx.font = '18px Arial'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(tavolo.nome || `Tavolo ${tavolo.numero}`, 200, 95)

    // Posti
    ctx.font = '14px Arial'
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.fillText(`${tavolo.posti} posti`, 200, 118)

    // QR code
    const qrTemp = document.createElement('canvas')
    await QRCode.toCanvas(qrTemp, getUrlTavolo(tavolo), {
      width: 220, margin: 1,
      color: { dark: brandColor, light: '#FFFFFF' }
    })
    ctx.drawImage(qrTemp, 90, 140, 220, 220)

    // Bordo QR
    ctx.strokeStyle = brandColor + '33'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(85, 135, 230, 230, 12)
    ctx.stroke()

    // Testo sotto
    ctx.fillStyle = '#222222'
    ctx.font = 'bold 18px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Scansiona per ordinare', 200, 400)

    ctx.fillStyle = '#AAAAAA'
    ctx.font = '13px Arial'
    ctx.fillText('Nessuna app richiesta', 200, 424)

    // Linea decorativa
    ctx.strokeStyle = brandColor
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(140, 445); ctx.lineTo(260, 445)
    ctx.stroke()

    // Bordo esterno
    ctx.strokeStyle = '#EEEEEE'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(2, 2, 396, 496, 20)
    ctx.stroke()

    return canvas
  }

  const scaricaQR = async (tavolo: Tavolo) => {
    const card = await generaQRCard(tavolo)
    const link = document.createElement('a')
    link.download = `QR-${ristorante.nome}-Tavolo-${tavolo.numero}.png`
    link.href = card.toDataURL('image/png', 1.0)
    link.click()
    toast.success(`QR Tavolo ${tavolo.numero} scaricato!`)
  }

  const stampaTutti = async () => {
    const brandColor = ristorante.colori.primario || '#E63946'
    const qrDataUrls: { tavolo: Tavolo; dataUrl: string }[] = []

    for (const t of tavoli) {
      const card = await generaQRCard(t)
      qrDataUrls.push({ tavolo: t, dataUrl: card.toDataURL() })
    }

    const win = window.open('', '_blank')
    if (!win) return

    const cards = qrDataUrls.map(({ tavolo, dataUrl }) => `
      <div class="card">
        <img src="${dataUrl}" width="200" height="250" style="border-radius:10px;" />
      </div>
    `).join('')

    win.document.write(`
      <html><head><title>QR — ${ristorante.nome}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial; background: #f5f5f5; padding: 20px; }
        h1 { text-align:center; margin-bottom:20px; color:#333; font-size:20px; }
        .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .card { text-align:center; }
        @media print { body { background:white; padding:10px; } }
      </style></head>
      <body>
        <h1>${ristorante.nome} — QR Codes Tavoli</h1>
        <div class="grid">${cards}</div>
        <script>window.onload = () => setTimeout(() => window.print(), 500)</script>
      </body></html>
    `)
    win.document.close()
  }

  const eliminaTavolo = async (t: Tavolo) => {
    if (!confirm(`Eliminare ${t.nome}?`)) return
    await deleteDoc(doc(db, 'ristoranti', ristorante.id, 'tavoli', t.id))
    toast.success('Tavolo eliminato')
    caricaTavoli()
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="font-semibold text-gray-700">
          Tavoli <span className="text-gray-400 font-normal">({tavoli.length})</span>
        </h2>
        <div className="flex gap-2 flex-wrap">
          {tavoli.length > 0 && (
            <button onClick={stampaTutti}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Stampa tutti i QR
            </button>
          )}
          <button onClick={creaTavoliInBulk}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Crea in blocco
          </button>
          <button onClick={() => setMostraCrea(!mostraCrea)}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">
            + Nuovo tavolo
          </button>
        </div>
      </div>

      {mostraCrea && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 max-w-md">
          <h3 className="font-semibold text-gray-800 mb-4">Nuovo tavolo</h3>
          <form onSubmit={handleCreaTavolo} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero *</label>
                <input type="number" min="1" value={form.numero}
                  onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="1" required
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Posti</label>
                <input type="number" min="1" value={form.posti}
                  onChange={e => setForm(f => ({ ...f, posti: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome personalizzato</label>
              <input value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="es. Tavolo terrazza"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
            </div>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setMostraCrea(false)}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Annulla</button>
              <button type="submit"
                className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium">Crea tavolo</button>
            </div>
          </form>
        </div>
      )}

      {tavoli.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-5xl mb-4">🪑</p>
          <p className="text-gray-500 mb-2">Nessun tavolo ancora</p>
          <button onClick={creaTavoliInBulk} className="bg-red-500 text-white px-6 py-3 rounded-xl font-medium mt-4">
            Crea tavoli in blocco
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {tavoli.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-3 py-2 text-center text-white text-sm font-semibold"
                style={{ background: ristorante.colori.primario || '#E63946' }}>
                {t.nome || `Tavolo ${t.numero}`}
              </div>
              <div className="p-3 flex justify-center">
                <canvas ref={el => { canvasRefs.current[t.id] = el }} style={{ width: 140, height: 140 }}/>
              </div>
              <div className="px-3 pb-3 text-center">
                <p className="text-xs text-gray-400 mb-2">{t.posti} posti</p>
                <div className="flex gap-1">
                  <button onClick={() => scaricaQR(t)}
                    className="flex-1 text-xs py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg font-medium">
                    Scarica
                  </button>
                  <button onClick={() => eliminaTavolo(t)}
                    className="text-xs py-1.5 px-2 text-red-400 hover:text-red-500 rounded-lg">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
