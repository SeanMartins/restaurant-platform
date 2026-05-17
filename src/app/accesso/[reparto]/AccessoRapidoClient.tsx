'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getRistorante } from '@/lib/firestore'

const REPARTI: Record<string, { label: string; colore: string; emoji: string }> = {
  cucina:      { label: 'Cucina',      colore: '#E63946', emoji: '👨‍🍳' },
  pizzeria:    { label: 'Pizzeria',    colore: '#F4A261', emoji: '🍕' },
  bar:         { label: 'Bar',         colore: '#457B9D', emoji: '🍷' },
  pasticceria: { label: 'Pasticceria', colore: '#E76F51', emoji: '🍰' },
  antipasti:   { label: 'Antipasti',   colore: '#2A9D8F', emoji: '🥗' },
  cassa:       { label: 'Cassa',       colore: '#264653', emoji: '💰' },
}

export default function AccessoRapidoClient({ params }: { params: { reparto: string } }) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const restaurantId = searchParams.get('r')
  const reparto      = params.reparto

  const [password, setPassword]         = useState('')
  const [tipo, setTipo]                 = useState<'pin' | 'testo'>('pin')
  const [loading, setLoading]           = useState(false)
  const [errore, setErrore]             = useState('')
  const [nomeRistorante, setNomeRistorante] = useState('')

  const info = REPARTI[reparto] || { label: reparto, colore: '#E63946', emoji: '🔑' }

  useEffect(() => {
    if (!restaurantId) return
    const sessione = sessionStorage.getItem(`accesso_${restaurantId}_${reparto}`)
    if (sessione) { router.replace(`/${reparto}?r=${restaurantId}`); return }
    getRistorante(restaurantId).then(r => { if (r) setNomeRistorante(r.nome) })
  }, [restaurantId, reparto])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !password) { setErrore('Inserisci la password'); return }
    setLoading(true); setErrore('')
    try {
      const res = await fetch('/api/accesso-rapido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, password, reparto })
      })
      const data = await res.json()
      if (data.success) {
        sessionStorage.setItem(`accesso_${restaurantId}_${reparto}`, JSON.stringify({ reparto, restaurantId, timestamp: Date.now() }))
        router.replace(`/${reparto}?r=${restaurantId}`)
      } else {
        setErrore('Password errata')
        setPassword('')
      }
    } catch { setErrore('Errore di connessione') }
    finally { setLoading(false) }
  }

  const handlePinClick = (cifra: string) => {
    if (cifra === '←') { setPassword(p => p.slice(0, -1)); return }
    if (password.length >= 6) return
    setPassword(p => p + cifra)
  }

  useEffect(() => {
    if (tipo === 'pin' && password.length >= 4) {
      const timer = setTimeout(() => document.getElementById('btn-accedi')?.click(), 300)
      return () => clearTimeout(timer)
    }
  }, [password, tipo])

  if (!restaurantId) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center p-8 bg-white rounded-2xl shadow">
        <p className="text-5xl mb-4">⚠️</p>
        <p className="text-gray-600">Link non valido</p>
        <p className="text-sm text-gray-400 mt-2">Scansiona il QR corretto dal dashboard</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: info.colore + '15' }}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="px-8 pt-10 pb-8 text-center" style={{ background: info.colore }}>
          <p className="text-5xl mb-3">{info.emoji}</p>
          <h1 className="text-2xl font-bold text-white">{info.label}</h1>
          {nomeRistorante && <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>{nomeRistorante}</p>}
        </div>
        <div className="p-6">
          <p className="text-center text-gray-500 text-sm mb-5">Inserisci la password per accedere</p>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
            {(['pin', 'testo'] as const).map(t => (
              <button key={t} onClick={() => { setTipo(t); setPassword('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tipo === t ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                {t === 'pin' ? 'PIN numerico' : 'Password'}
              </button>
            ))}
          </div>
          <form onSubmit={handleLogin}>
            {tipo === 'pin' && (
              <div>
                <div className="flex justify-center gap-3 mb-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-bold transition-all"
                      style={{ borderColor: i < password.length ? info.colore : '#e5e7eb', background: i < password.length ? info.colore + '20' : 'transparent', color: info.colore }}>
                      {i < password.length ? '●' : ''}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {['1','2','3','4','5','6','7','8','9','','0','←'].map((c, i) => (
                    <button key={i} type="button" onClick={() => c !== '' && handlePinClick(c)} disabled={c === ''}
                      className={`h-14 rounded-2xl text-xl font-semibold transition-all ${c === '' ? 'invisible' : c === '←' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-gray-50 text-gray-800 hover:bg-gray-100 active:scale-95'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tipo === 'testo' && (
              <div className="mb-4">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Inserisci password" autoFocus
                  className="w-full px-4 py-4 border-2 rounded-2xl text-center text-lg tracking-widest focus:outline-none transition-colors"
                  style={{ borderColor: password ? info.colore : '#e5e7eb' }}/>
              </div>
            )}
            {errore && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-center">
                <p className="text-red-600 text-sm font-medium">{errore}</p>
              </div>
            )}
            <button id="btn-accedi" type="submit" disabled={loading || !password}
              className="w-full py-4 rounded-2xl text-white font-bold text-lg disabled:opacity-40 transition-all"
              style={{ background: info.colore }}>
              {loading ? 'Verifica...' : 'Accedi'}
            </button>
          </form>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-6 text-center">Scansiona il QR dal pannello manager</p>
    </div>
  )
}
