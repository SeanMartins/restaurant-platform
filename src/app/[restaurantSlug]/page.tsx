'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { getRistoranteBySlug, getCategorie, getPiatti, getTavoli, creaOrdine } from '@/lib/firestore'
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Piatto, Tavolo, RigaOrdine, Ordine } from '@/types'
import toast from 'react-hot-toast'

interface CarrelloItem { piatto: Piatto; quantita: number; note: string }
interface OrdineInviato {
  id: string; righe: RigaOrdine[]; totale: number
  createdAt: string; stato: string; tempoRimasto: number
}

export default function MenuPubblico({ params }: { params: { restaurantSlug: string } }) {
  const searchParams = useSearchParams()
  const tavoloId  = searchParams.get('tavolo')
  const tavoloNum = searchParams.get('n')

  const [ristorante, setRistorante]     = useState<Ristorante | null>(null)
  const [categorie, setCategorie]       = useState<any[]>([])
  const [piatti, setPiatti]             = useState<Piatto[]>([])
  const [tavolo, setTavolo]             = useState<Tavolo | null>(null)
  const [loading, setLoading]           = useState(true)
  const [categoriaAttiva, setCategoriaAttiva] = useState('')
  const [carrello, setCarrello]         = useState<CarrelloItem[]>([])
  const [mostraCarrello, setMostraCarrello] = useState(false)
  const [inviando, setInviando]         = useState(false)
  const [vista, setVista]               = useState<'menu' | 'ordini'>('menu')
  const [ordiniInviati, setOrdiniInviati] = useState<OrdineInviato[]>([])
  const timerRef = useRef<any>(null)

  useEffect(() => { caricaDati() }, [params.restaurantSlug])

  const caricaDati = async () => {
    const r = await getRistoranteBySlug(params.restaurantSlug)
    if (!r || !r.attivo) { setLoading(false); return }
    setRistorante(r)
    const [cats, platti, tavoli] = await Promise.all([
      getCategorie(r.id), getPiatti(r.id), getTavoli(r.id)
    ])
    const catsAttive = cats.filter((c: any) => c.attiva)
    setCategorie(catsAttive)
    setPiatti(platti.filter(p => p.disponibile))
    if (catsAttive.length > 0) setCategoriaAttiva(catsAttive[0].id)
    if (tavoloId) { const t = tavoli.find(t => t.id === tavoloId); if (t) setTavolo(t) }
    setLoading(false)
  }

  useEffect(() => {
    if (!ristorante) return
    document.documentElement.style.setProperty('--brand-primary',   ristorante.colori.primario)
    document.documentElement.style.setProperty('--brand-secondary', ristorante.colori.secondario)
    document.documentElement.style.setProperty('--brand-bg',        ristorante.colori.sfondo)
    document.documentElement.style.setProperty('--brand-text',      ristorante.colori.testo)
    document.documentElement.style.setProperty('--brand-font',      ristorante.font || 'Inter')
  }, [ristorante])

  // Countdown timer
  useEffect(() => {
    if (ordiniInviati.length === 0) return
    timerRef.current = setInterval(() => {
      setOrdiniInviati(prev => prev.map(o => ({ ...o, tempoRimasto: Math.max(0, o.tempoRimasto - 1) })))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [ordiniInviati.length])

  // Ascolta aggiornamenti ordini realtime
  useEffect(() => {
    if (!ristorante || ordiniInviati.length === 0) return
    const unsubs = ordiniInviati.map(o =>
      onSnapshot(doc(db, 'ristoranti', ristorante.id, 'ordini', o.id), snap => {
        if (!snap.exists()) return
        const dati = snap.data() as Ordine
        setOrdiniInviati(prev => prev.map(ord =>
          ord.id === o.id ? { ...ord, righe: dati.righe, stato: dati.stato } : ord
        ))
      })
    )
    return () => unsubs.forEach(u => u())
  }, [ristorante, ordiniInviati.length])

  const aggiungi = (p: Piatto) => {
    setCarrello(prev => {
      const e = prev.find(i => i.piatto.id === p.id)
      if (e) return prev.map(i => i.piatto.id === p.id ? { ...i, quantita: i.quantita + 1 } : i)
      return [...prev, { piatto: p, quantita: 1, note: '' }]
    })
    toast.success(`${p.nome} aggiunto!`, { duration: 900 })
  }

  const rimuovi = (id: string) => {
    setCarrello(prev => {
      const item = prev.find(i => i.piatto.id === id)
      if (!item) return prev
      if (item.quantita === 1) return prev.filter(i => i.piatto.id !== id)
      return prev.map(i => i.piatto.id === id ? { ...i, quantita: i.quantita - 1 } : i)
    })
  }

  const totale   = carrello.reduce((s, i) => s + i.piatto.prezzo * i.quantita, 0)
  const quantita = carrello.reduce((s, i) => s + i.quantita, 0)

  const inviaOrdine = async () => {
    if (!ristorante || !tavoloId || carrello.length === 0) return
    setInviando(true)
    try {
      const righe: RigaOrdine[] = carrello.map(item => ({
        piattoId: item.piatto.id, nome: item.piatto.nome, prezzo: item.piatto.prezzo,
        quantita: item.quantita, reparto: item.piatto.reparto, note: item.note, stato: 'ricevuto'
      }))
      const nuovoOrdine = await creaOrdine(ristorante.id, {
        tavoloId, tavoloNumero: tavolo?.numero || parseInt(tavoloNum || '0'),
        righe, totale, stato: 'ricevuto'
      })
      setOrdiniInviati(prev => [...prev, {
        id: nuovoOrdine.id, righe, totale, createdAt: nuovoOrdine.createdAt,
        stato: 'ricevuto', tempoRimasto: 180
      }])
      setCarrello([])
      setMostraCarrello(false)
      setVista('ordini')
      toast.success('Ordine inviato! 🍽️')
    } catch { toast.error('Errore nell\'invio') } finally { setInviando(false) }
  }

  const annullaOrdine = async (id: string) => {
    if (!ristorante) return
    try {
      await deleteDoc(doc(db, 'ristoranti', ristorante.id, 'ordini', id))
      setOrdiniInviati(prev => prev.filter(o => o.id !== id))
      toast.success('Ordine annullato!')
    } catch { toast.error('Errore nell\'annullamento') }
  }

  const statoLabel = (stato: string) => {
    const map: Record<string, { label: string; color: string }> = {
      ricevuto:        { label: '🆕 Ricevuto',        color: 'bg-blue-100 text-blue-700' },
      in_preparazione: { label: '👨‍🍳 In preparazione', color: 'bg-yellow-100 text-yellow-700' },
      pronto:          { label: '✅ Pronto!',          color: 'bg-green-100 text-green-700' },
      servito:         { label: '🍽️ Servito',          color: 'bg-gray-100 text-gray-500' },
    }
    return map[stato] || { label: stato, color: 'bg-gray-100 text-gray-500' }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--brand-bg)' }}>
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand-primary)' }} />
    </div>
  )

  if (!ristorante) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center"><p className="text-5xl mb-4">🍽️</p><p className="text-gray-500">Ristorante non trovato</p></div>
    </div>
  )

  const piattiCat = piatti.filter(p => p.categoriaId === categoriaAttiva)

  return (
    <div className="min-h-screen pb-32" style={{ background: 'var(--brand-bg)', color: 'var(--brand-text)', fontFamily: 'var(--brand-font)' }}>

      {/* Header sticky */}
      <div className="sticky top-0 z-10 shadow-sm" style={{ background: 'var(--brand-bg)' }}>
        <div className="px-4 pt-5 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: 'var(--brand-primary)' }}>
                {ristorante.nome.charAt(0)}
              </div>
              <div>
                <h1 className="font-bold text-lg">{ristorante.nome}</h1>
                {tavolo && <p className="text-xs opacity-60">{tavolo.nome || `Tavolo ${tavolo.numero}`}</p>}
              </div>
            </div>
            <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.08)' }}>
              {(['menu', 'ordini'] as const).map(v => (
                <button key={v} onClick={() => setVista(v)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all relative capitalize"
                  style={vista === v ? { background: 'var(--brand-primary)', color: '#fff' } : { opacity: 0.6 }}
                >
                  {v === 'menu' ? 'Menu' : 'Ordini'}
                  {v === 'ordini' && ordiniInviati.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {ordiniInviati.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {vista === 'menu' && (
            <div className="flex gap-2 pb-2 overflow-x-auto">
              {categorie.map((c: any) => (
                <button key={c.id} onClick={() => setCategoriaAttiva(c.id)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap"
                  style={categoriaAttiva === c.id
                    ? { background: 'var(--brand-primary)', color: '#fff' }
                    : { border: '1px solid var(--brand-primary)', opacity: 0.7 }
                  }
                >{c.nome}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MENU */}
      {vista === 'menu' && (
        <div className="px-4 pt-3 flex flex-col gap-3">
          {piattiCat.length === 0
            ? <div className="text-center py-16 opacity-50"><p className="text-4xl mb-2">🍽️</p><p>Nessun piatto</p></div>
            : piattiCat.map(p => {
              const inCarrello = carrello.find(i => i.piatto.id === p.id)
              return (
                <div key={p.id} className="rounded-2xl p-4 shadow-sm flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.85)' }}>
                  <div className="flex-1 mr-4">
                    <h3 className="font-semibold">{p.nome}</h3>
                    {p.descrizione && <p className="text-sm opacity-60 mt-0.5">{p.descrizione}</p>}
                    <p className="font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>€ {p.prezzo.toFixed(2)}</p>
                  </div>
                  {inCarrello ? (
                    <div className="flex items-center gap-3">
                      <button onClick={() => rimuovi(p.id)} className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>−</button>
                      <span className="font-bold w-4 text-center">{inCarrello.quantita}</span>
                      <button onClick={() => aggiungi(p)} className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => aggiungi(p)} className="w-9 h-9 rounded-full text-white font-bold text-xl shadow-md flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>+</button>
                  )}
                </div>
              )
            })
          }
        </div>
      )}

      {/* ORDINI */}
      {vista === 'ordini' && (
        <div className="px-4 pt-4 flex flex-col gap-4">
          {ordiniInviati.length === 0 ? (
            <div className="text-center py-20 opacity-50">
              <p className="text-5xl mb-3">🍽️</p><p>Nessun ordine ancora</p>
              <button onClick={() => setVista('menu')} className="mt-4 px-6 py-2 rounded-xl text-white text-sm" style={{ background: 'var(--brand-primary)' }}>Vai al menu</button>
            </div>
          ) : (
            <>
              {ordiniInviati.map(ordine => {
                const s = statoLabel(ordine.stato)
                const puoAnnullare = ordine.tempoRimasto > 0 && ordine.stato === 'ricevuto'
                return (
                  <div key={ordine.id} className="bg-white rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
                      <span className="text-xs text-gray-400">{new Date(ordine.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex flex-col gap-2 mb-4">
                      {ordine.righe.map((riga, idx) => {
                        const rs = statoLabel(riga.stato)
                        return (
                          <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-50">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>{riga.quantita}</span>
                              <span className="text-sm font-medium">{riga.nome}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${rs.color}`}>{rs.label}</span>
                              <span className="text-sm text-gray-500">€ {(riga.prezzo * riga.quantita).toFixed(2)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold" style={{ color: 'var(--brand-primary)' }}>Totale: € {ordine.totale.toFixed(2)}</span>
                      {puoAnnullare && (
                        <button onClick={() => annullaOrdine(ordine.id)} className="flex items-center gap-2 text-sm text-red-500 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-50">
                          ✕ Annulla
                          <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-mono">
                            {Math.floor(ordine.tempoRimasto / 60)}:{String(ordine.tempoRimasto % 60).padStart(2, '0')}
                          </span>
                        </button>
                      )}
                      {!puoAnnullare && ordine.stato === 'ricevuto' && <span className="text-xs text-gray-400">Tempo scaduto</span>}
                    </div>
                  </div>
                )
              })}
              <button onClick={() => setVista('menu')} className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium opacity-60 hover:opacity-100" style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}>
                + Aggiungi altri piatti
              </button>
            </>
          )}
        </div>
      )}

      {/* Carrello bottom bar */}
      {carrello.length > 0 && !mostraCarrello && (
        <div className="fixed bottom-6 left-4 right-4 z-40">
          <button onClick={() => setMostraCarrello(true)} className="w-full py-4 rounded-2xl text-white font-bold shadow-xl flex items-center justify-between px-6" style={{ background: 'var(--brand-primary)' }}>
            <span className="bg-white bg-opacity-30 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">{quantita}</span>
            <span>Vedi ordine</span>
            <span>€ {totale.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Modale carrello */}
      {mostraCarrello && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostraCarrello(false)} />
          <div className="relative bg-white rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-800 text-lg">Il tuo ordine</h2>
              <button onClick={() => setMostraCarrello(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            {tavolo && <div className="bg-gray-50 rounded-xl px-4 py-2 mb-4 text-sm text-gray-600">📍 {tavolo.nome || `Tavolo ${tavolo.numero}`}</div>}
            <div className="flex flex-col gap-3 mb-6">
              {carrello.map(item => (
                <div key={item.piatto.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{item.piatto.nome}</p>
                    <p className="text-sm text-gray-400">€ {item.piatto.prezzo.toFixed(2)} cad.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => rimuovi(item.piatto.id)} className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>−</button>
                    <span className="font-bold w-4 text-center">{item.quantita}</span>
                    <button onClick={() => aggiungi(item.piatto)} className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center" style={{ background: 'var(--brand-primary)' }}>+</button>
                    <span className="font-semibold text-gray-800 w-16 text-right">€ {(item.piatto.prezzo * item.quantita).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4 mb-6">
              <div className="flex justify-between font-bold text-lg">
                <span>Totale</span>
                <span style={{ color: 'var(--brand-primary)' }}>€ {totale.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={inviaOrdine} disabled={inviando} className="w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg disabled:opacity-50" style={{ background: 'var(--brand-primary)' }}>
              {inviando ? 'Invio in corso...' : '🍽️ Invia ordine alla cucina'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
