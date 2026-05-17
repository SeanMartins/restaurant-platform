'use client'
import { useState, useEffect, useRef } from 'react'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, UserRole } from '@/types'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'

const RUOLI: { id: UserRole; label: string; emoji: string; desc: string; colore: string }[] = [
  { id: 'cucina',      label: 'Cucina',      emoji: '👨‍🍳', desc: 'Primi, secondi, contorni', colore: '#E63946' },
  { id: 'pizzeria',    label: 'Pizzeria',     emoji: '🍕', desc: 'Solo le pizze',              colore: '#F4A261' },
  { id: 'bar',         label: 'Bar',          emoji: '🍷', desc: 'Bevande e caffè',            colore: '#457B9D' },
  { id: 'pasticceria', label: 'Pasticceria',  emoji: '🍰', desc: 'Dolci e dessert',            colore: '#E76F51' },
  { id: 'antipasti',   label: 'Antipasti',    emoji: '🥗', desc: 'Antipasti freddi e caldi',   colore: '#2A9D8F' },
  { id: 'cassa',       label: 'Cassa',        emoji: '💰', desc: 'Conto e gestione tavoli',    colore: '#264653' },
]

export default function OperatoriManager({ ristorante }: { ristorante: Ristorante }) {
  const [form, setForm]           = useState({ email: '', password: '', displayName: '', role: 'cucina' as UserRole })
  const [loading, setLoading]     = useState(false)
  const [vistaAttiva, setVistaAttiva] = useState<'qr' | 'crea' | 'password'>('password')
  const canvasRefs = useRef<{ [key: string]: HTMLCanvasElement | null }>({})

  // Config accesso rapido
  const [configPassword, setConfigPassword] = useState({
    abilitato: false,
    tipo: 'pin' as 'pin' | 'testo',
    password: '',
  })
  const [mostraPassword, setMostraPassword] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  useEffect(() => { caricaConfig() }, [ristorante.id])

  useEffect(() => {
    if (vistaAttiva === 'qr' && configPassword.abilitato) {
      setTimeout(() => RUOLI.forEach(r => generaQR(r.id, r.colore)), 200)
    }
  }, [vistaAttiva, configPassword.abilitato])

  const caricaConfig = async () => {
    try {
      const snap = await getDoc(doc(db, 'ristoranti', ristorante.id, 'config', 'accesso-rapido'))
      if (snap.exists()) setConfigPassword({ ...configPassword, ...snap.data() as any })
    } catch {}
  }

  const salvaConfig = async () => {
    setSalvandoConfig(true)
    try {
      await setDoc(doc(db, 'ristoranti', ristorante.id, 'config', 'accesso-rapido'), configPassword)
      toast.success('Configurazione salvata!')
    } catch { toast.error('Errore nel salvataggio') }
    finally { setSalvandoConfig(false) }
  }

  const getUrlAccesso = (ruoloId: string) =>
    `${process.env.NEXT_PUBLIC_APP_URL}/accesso/${ruoloId}?r=${ristorante.id}`

  const generaQR = async (ruoloId: string, colore: string) => {
    const canvas = canvasRefs.current[ruoloId]
    if (!canvas) return
    await QRCode.toCanvas(canvas, getUrlAccesso(ruoloId), {
      width: 160, margin: 2,
      color: { dark: colore, light: '#FFFFFF' }
    })
  }

  const generaQRCard = async (ruolo: typeof RUOLI[0]): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas')
    canvas.width = 400; canvas.height = 500
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath(); ctx.roundRect(0, 0, 400, 500, 20); ctx.fill()

    ctx.fillStyle = ruolo.colore
    ctx.beginPath(); ctx.roundRect(0, 0, 400, 130, [20, 20, 0, 0]); ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = '13px Arial'; ctx.textAlign = 'center'
    ctx.fillText(ristorante.nome, 200, 32)

    ctx.font = 'bold 30px Arial'; ctx.fillStyle = '#FFFFFF'
    ctx.fillText(ruolo.label, 200, 78)

    ctx.font = '14px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.80)'
    ctx.fillText(ruolo.desc, 200, 108)

    const qrTemp = document.createElement('canvas')
    await QRCode.toCanvas(qrTemp, getUrlAccesso(ruolo.id), {
      width: 210, margin: 1,
      color: { dark: ruolo.colore, light: '#FFFFFF' }
    })
    ctx.drawImage(qrTemp, 95, 142, 210, 210)

    ctx.strokeStyle = ruolo.colore + '33'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(90, 137, 220, 220, 10); ctx.stroke()

    ctx.fillStyle = '#333333'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'
    ctx.fillText('Scansiona per accedere', 200, 385)

    ctx.fillStyle = '#AAAAAA'; ctx.font = '11px Arial'
    ctx.fillText(configPassword.tipo === 'pin' ? 'Inserisci il PIN per entrare' : 'Inserisci la password per entrare', 200, 406)

    ctx.strokeStyle = ruolo.colore; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(150, 430); ctx.lineTo(250, 430); ctx.stroke()

    ctx.strokeStyle = '#EEEEEE'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(2, 2, 396, 496, 20); ctx.stroke()

    return canvas
  }

  const scaricaQR = async (ruolo: typeof RUOLI[0]) => {
    const card = await generaQRCard(ruolo)
    const link = document.createElement('a')
    link.download = `QR-${ruolo.label}-${ristorante.nome}.png`
    link.href = card.toDataURL('image/png', 1.0)
    link.click()
    toast.success(`QR ${ruolo.label} scaricato!`)
  }

  const stampaTutti = async () => {
    const cards: { ruolo: typeof RUOLI[0]; dataUrl: string }[] = []
    for (const r of RUOLI) {
      const card = await generaQRCard(r)
      cards.push({ ruolo: r, dataUrl: card.toDataURL() })
    }
    const win = window.open('', '_blank')
    if (!win) return
    const html = cards.map(({ ruolo, dataUrl }) => `
      <div class="card"><img src="${dataUrl}" width="200" height="250" style="border-radius:10px;" /></div>
    `).join('')
    win.document.write(`
      <html><head><title>QR Operatori — ${ristorante.nome}</title>
      <style>* {margin:0;padding:0;box-sizing:border-box;} body{font-family:Arial;background:#f5f5f5;padding:20px;}
      h1{text-align:center;margin-bottom:20px;color:#333;font-size:20px;}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;} .card{text-align:center;}
      @media print{body{background:white;}}</style></head>
      <body><h1>${ristorante.nome} — QR Accesso Operatori</h1>
      <div class="grid">${html}</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),500)</script>
      </body></html>
    `)
    win.document.close()
  }

  const creaOperatore = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/crea-utente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, restaurantId: ristorante.id })
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Operatore ${form.displayName} creato!`)
        setForm({ email: '', password: '', displayName: '', role: 'cucina' })
      } else { toast.error(data.error || 'Errore creazione') }
    } catch { toast.error('Errore di rete') }
    finally { setLoading(false) }
  }

  return (
    <div>
      {/* Tab navigazione */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setVistaAttiva('password')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            vistaAttiva === 'password' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}>
          🔑 Accesso rapido
        </button>
        <button onClick={() => setVistaAttiva('qr')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            vistaAttiva === 'qr' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}>
          QR Operatori
        </button>
        <button onClick={() => setVistaAttiva('crea')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            vistaAttiva === 'crea' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}>
          + Crea operatore
        </button>
      </div>

      {/* VISTA PASSWORD */}
      {vistaAttiva === 'password' && (
        <div className="max-w-md">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-1">Accesso rapido operatori</h3>
            <p className="text-sm text-gray-500 mb-5">
              Gli operatori scansionano il QR e inseriscono solo questa password — niente email!
            </p>

            {/* Toggle abilitato */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-5">
              <div>
                <p className="font-medium text-gray-700 text-sm">Abilita accesso rapido</p>
                <p className="text-xs text-gray-400 mt-0.5">Se disabilitato gli operatori devono fare login normale</p>
              </div>
              <button
                onClick={() => setConfigPassword(c => ({ ...c, abilitato: !c.abilitato }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  configPassword.abilitato ? 'bg-red-500' : 'bg-gray-200'
                }`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                  configPassword.abilitato ? 'left-7' : 'left-1'
                }`}/>
              </button>
            </div>

            {configPassword.abilitato && (
              <>
                {/* Tipo accesso */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo di accesso</label>
                  <div className="flex gap-2">
                    {(['pin', 'testo'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setConfigPassword(c => ({ ...c, tipo: t, password: '' }))}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                          configPassword.tipo === t
                            ? 'border-red-400 bg-red-50 text-red-700'
                            : 'border-gray-200 text-gray-600'
                        }`}>
                        {t === 'pin' ? '🔢 PIN numerico' : '🔤 Password testo'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Password */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {configPassword.tipo === 'pin' ? 'PIN (4-6 cifre)' : 'Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={mostraPassword ? 'text' : 'password'}
                      value={configPassword.password}
                      onChange={e => {
                        const val = configPassword.tipo === 'pin'
                          ? e.target.value.replace(/\D/g, '').slice(0, 6)
                          : e.target.value
                        setConfigPassword(c => ({ ...c, password: val }))
                      }}
                      placeholder={configPassword.tipo === 'pin' ? 'es. 1234' : 'es. ristorante2024'}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 pr-20"
                    />
                    <button type="button" onClick={() => setMostraPassword(!mostraPassword)}
                      className="absolute right-3 top-3 text-xs text-gray-400 hover:text-gray-600">
                      {mostraPassword ? 'Nascondi' : 'Mostra'}
                    </button>
                  </div>
                  {configPassword.tipo === 'pin' && (
                    <p className="text-xs text-gray-400 mt-1">Solo numeri, 4-6 cifre</p>
                  )}
                </div>

                {/* Info */}
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5">
                  <p className="text-xs text-amber-700">
                    ⚠️ <strong>Importante:</strong> comunica questa password solo al tuo staff.
                    Cambiala regolarmente per sicurezza.
                  </p>
                </div>
              </>
            )}

            <button onClick={salvaConfig} disabled={salvandoConfig}
              className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-semibold">
              {salvandoConfig ? 'Salvataggio...' : 'Salva configurazione'}
            </button>
          </div>

          {configPassword.abilitato && configPassword.password && (
            <div className="mt-4 bg-green-50 border border-green-100 rounded-2xl p-4">
              <p className="text-sm font-medium text-green-800 mb-1">✅ Accesso rapido attivo</p>
              <p className="text-sm text-green-700">
                Vai su <strong>QR Operatori</strong> per scaricare i QR da distribuire al tuo staff.
                Ogni operatore scansiona il suo QR e inserisce il {configPassword.tipo === 'pin' ? 'PIN' : 'la password'}.
              </p>
              <button onClick={() => setVistaAttiva('qr')}
                className="mt-3 text-sm font-medium text-green-700 underline">
                Vai ai QR Operatori →
              </button>
            </div>
          )}
        </div>
      )}

      {/* VISTA QR */}
      {vistaAttiva === 'qr' && (
        <div>
          {!configPassword.abilitato || !configPassword.password ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center max-w-md">
              <p className="text-3xl mb-3">🔑</p>
              <p className="font-semibold text-amber-800 mb-2">Configura prima l&apos;accesso rapido</p>
              <p className="text-sm text-amber-700 mb-4">
                Devi abilitare e impostare una password prima di generare i QR.
              </p>
              <button onClick={() => setVistaAttiva('password')}
                className="bg-amber-500 text-white px-5 py-2 rounded-xl text-sm font-medium">
                Vai alle impostazioni →
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-semibold text-gray-800">QR code per ogni reparto</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Scansiona → inserisci {configPassword.tipo === 'pin' ? 'PIN' : 'password'} → accesso diretto
                  </p>
                </div>
                <button onClick={stampaTutti}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Stampa tutti
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {RUOLI.map(ruolo => (
                  <div key={ruolo.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 text-center text-white" style={{ background: ruolo.colore }}>
                      <p className="font-bold text-base">{ruolo.label}</p>
                      <p className="text-xs opacity-75 mt-0.5">{ruolo.desc}</p>
                    </div>
                    <div className="p-3 flex justify-center">
                      <canvas ref={el => { canvasRefs.current[ruolo.id] = el }} style={{ width: 140, height: 140 }}/>
                    </div>
                    <div className="px-3 pb-3 text-center">
                      <p className="text-xs text-gray-400 font-mono mb-2 truncate">/accesso/{ruolo.id}</p>
                      <button onClick={() => scaricaQR(ruolo)}
                        className="w-full text-xs py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg font-medium">
                        Scarica QR
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <p className="text-sm font-medium text-blue-800 mb-1">Come funziona</p>
                <p className="text-sm text-blue-700">
                  1. Stampa o mostra il QR al tuo operatore<br/>
                  2. L&apos;operatore scansiona con il telefono<br/>
                  3. Inserisce il {configPassword.tipo === 'pin' ? 'PIN' : 'la password'}<br/>
                  4. Accede direttamente alla sua dashboard
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* VISTA CREA OPERATORE */}
      {vistaAttiva === 'crea' && (
        <div className="max-w-xl">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-1">Crea account operatore</h3>
            <p className="text-sm text-gray-500 mb-5">
              Crea un account Firebase per l&apos;operatore — utile per il login tradizionale.
            </p>
            <form onSubmit={creaOperatore} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="es. Marco - Cucina" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="cucina@ristorante.it" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="minimo 6 caratteri" required minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ruolo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {RUOLI.map(r => (
                    <button key={r.id} type="button"
                      onClick={() => setForm(f => ({ ...f, role: r.id }))}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors"
                      style={form.role === r.id
                        ? { borderColor: r.colore, background: r.colore + '15', color: r.colore }
                        : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                      <span>{r.emoji}</span>
                      <span className="font-medium">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-semibold mt-2">
                {loading ? 'Creazione...' : 'Crea operatore'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
