'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { getRistoranteBySlug, getCategorie, getPiatti, getTavoli, creaOrdine, getOrdiniTavolo } from '@/lib/firestore'
import { doc, onSnapshot, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Piatto, Tavolo, RigaOrdine, Ordine } from '@/types'
import toast from 'react-hot-toast'

interface CarrelloItem { piatto: Piatto; quantita: number; note: string }
interface OrdineInviato {
  id: string; righe: RigaOrdine[]; totale: number
  createdAt: string; stato: string; tempoRimasto: number
  metodoPagamento?: string
}
interface ConfigPagamenti {
  abilitaPagamentiOnline: boolean
  stripe:   { abilitato: boolean; publishableKey: string }
  paypal:   { abilitato: boolean; clientId: string }
  satispay: { abilitato: boolean; apiKey: string }
  pagaInCassa: { abilitato: boolean }
}

export default function MenuPubblico({ params }: { params: { restaurantSlug: string } }) {
  const searchParams = useSearchParams()
  const tavoloId  = searchParams.get('tavolo')
  const tavoloNum = searchParams.get('n')
  const esitoPagamento = searchParams.get('pagamento')

  const [ristorante, setRistorante]     = useState<Ristorante | null>(null)
  const [categorie, setCategorie]       = useState<any[]>([])
  const [piatti, setPiatti]             = useState<Piatto[]>([])
  const [tavolo, setTavolo]             = useState<Tavolo | null>(null)
  const [configPagamenti, setConfigPagamenti] = useState<ConfigPagamenti | null>(null)
  const [loading, setLoading]           = useState(true)
  const [categoriaAttiva, setCategoriaAttiva] = useState('')
  const [carrello, setCarrello]         = useState<CarrelloItem[]>([])
  const [mostraCarrello, setMostraCarrello] = useState(false)
  const [vista, setVista]               = useState<'menu' | 'ordini'>('menu')
  const [ordiniInviati, setOrdiniInviati] = useState<OrdineInviato[]>([])
  const [inviando, setInviando]         = useState(false)
  const [schermaPagamento, setSchermaPagamento] = useState(false)
  const timerRef = useRef<any>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
    if (tavoloId) {
      const t = tavoli.find(t => t.id === tavoloId)
      if (t) setTavolo(t)

      // Recupera ordini recenti del tavolo (sopravvive al redirect di Stripe/PayPal)
      const ordiniTavolo = await getOrdiniTavolo(r.id, tavoloId)
      if (ordiniTavolo.length > 0) {
        setOrdiniInviati(ordiniTavolo.map(o => ({
          id: o.id, righe: o.righe, totale: o.totale, createdAt: o.createdAt, stato: o.stato,
          tempoRimasto: Math.max(0, 180 - Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 1000)),
          metodoPagamento: o.metodoPagamento,
        })))
        setVista('ordini')
      }
    }

    if (esitoPagamento === 'ok') toast.success('Pagamento riuscito! Il tuo ordine è in preparazione.')
    if (esitoPagamento === 'annullato') toast.error('Pagamento annullato.')

    // Carica config pagamenti
    try {
      const snap = await getDoc(doc(db, 'ristoranti', r.id, 'config', 'pagamenti'))
      if (snap.exists()) setConfigPagamenti(snap.data() as ConfigPagamenti)
    } catch {}

    setLoading(false)
  }

  // Countdown timer
  useEffect(() => {
    if (ordiniInviati.length === 0) return
    timerRef.current = setInterval(() => {
      setOrdiniInviati(prev => prev.map(o => ({ ...o, tempoRimasto: Math.max(0, o.tempoRimasto - 1) })))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [ordiniInviati.length])

  // Ascolta ordini realtime
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

  const scrollToCategoria = (catId: string) => {
    setCategoriaAttiva(catId)
    sectionRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

  // Metodi pagamento disponibili
  const metodiDisponibili = () => {
    if (!configPagamenti) return [{ id: 'cassa', label: 'Paga in cassa', desc: 'Contanti o POS al tavolo', icon: '🏪' }]
    const metodi = []
    if (configPagamenti.pagaInCassa?.abilitato !== false)
      metodi.push({ id: 'cassa', label: 'Paga in cassa', desc: 'Contanti o POS al tavolo', icon: '🏪' })
    if (configPagamenti.abilitaPagamentiOnline) {
      if (configPagamenti.stripe?.abilitato && configPagamenti.stripe.publishableKey)
        metodi.push({ id: 'stripe', label: 'Carta di credito', desc: 'Visa, Mastercard, Amex', icon: '💳' })
      if (configPagamenti.paypal?.abilitato && configPagamenti.paypal.clientId)
        metodi.push({ id: 'paypal', label: 'PayPal', desc: 'Paga con il tuo account PayPal', icon: '🅿️' })
      // Satispay non ancora integrato lato pagamenti reali — non offerto ai clienti
    }
    return metodi
  }

  const inviaOrdine = async (metodoPagamento: string) => {
    if (!ristorante || !tavoloId || carrello.length === 0) return
    setInviando(true)
    try {
      const righe: RigaOrdine[] = carrello.map(item => ({
        piattoId: item.piatto.id, nome: item.piatto.nome, prezzo: item.piatto.prezzo,
        quantita: item.quantita, reparto: item.piatto.reparto, note: item.note, stato: 'ricevuto'
      }))
      const richiedePagamentoOnline = metodoPagamento === 'stripe' || metodoPagamento === 'paypal'
      const statoIniziale = richiedePagamentoOnline ? 'in_attesa_pagamento' : 'ricevuto'

      const nuovoOrdine = await creaOrdine(ristorante.id, {
        tavoloId, tavoloNumero: tavolo?.numero || parseInt(tavoloNum || '0'),
        righe, totale, stato: statoIniziale, metodoPagamento: metodoPagamento as any,
      })

      if (richiedePagamentoOnline) {
        const res = await fetch(`/api/pagamenti/${metodoPagamento}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId: ristorante.id, ordineId: nuovoOrdine.id }),
        })
        const dati = await res.json()
        if (!dati.success) throw new Error(dati.error || 'Checkout non disponibile')
        window.location.href = dati.url
        return // la pagina naviga via, niente altro da fare qui
      }

      setOrdiniInviati(prev => [...prev, {
        id: nuovoOrdine.id, righe, totale, createdAt: nuovoOrdine.createdAt,
        stato: 'ricevuto', tempoRimasto: 180, metodoPagamento
      }])
      setCarrello([])
      setMostraCarrello(false)
      setSchermaPagamento(false)
      setVista('ordini')
      toast.success('Ordine inviato! Pagherai in cassa.')
    } catch (err: any) {
      toast.error(err.message || 'Errore nell\'invio')
    } finally { setInviando(false) }
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
      in_attesa_pagamento: { label: 'In attesa di pagamento', color: 'bg-orange-100 text-orange-700' },
      ricevuto:        { label: 'Ricevuto',        color: 'bg-blue-100 text-blue-700' },
      in_preparazione: { label: 'In preparazione', color: 'bg-yellow-100 text-yellow-700' },
      pronto:          { label: 'Pronto!',          color: 'bg-green-100 text-green-700' },
      servito:         { label: 'Servito',          color: 'bg-gray-100 text-gray-500' },
    }
    return map[stato] || { label: stato, color: 'bg-gray-100 text-gray-500' }
  }

  const metodoPagamentoLabel = (id: string) => {
    const map: Record<string, string> = {
      cassa: '🏪 Paga in cassa', stripe: '💳 Carta', paypal: '🅿️ PayPal', satispay: '🔴 Satispay'
    }
    return map[id] || id
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f5f5' }}>
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#E63946' }} />
    </div>
  )

  if (!ristorante) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f5f5' }}>
      <div className="text-center"><p className="text-5xl mb-4">🍽️</p><p className="text-gray-500">Ristorante non trovato</p></div>
    </div>
  )

  const brandColor = ristorante.colori.primario || '#E63946'
  const brandBg    = ristorante.colori.sfondo    || '#f5f5f5'
  const brandText  = ristorante.colori.testo     || '#1D3557'
  const brandFont  = ristorante.font             || 'Inter'
  const metodi     = metodiDisponibili()

  return (
    <div className="min-h-screen pb-32" style={{ background: brandBg, fontFamily: brandFont, color: brandText }}>

      {/* HEADER */}
      <div className="sticky top-0 z-20" style={{ background: brandColor }}>
        <div className="px-5 pt-8 pb-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-white leading-tight">{ristorante.nome}</h1>
              {tavolo && <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>{tavolo.nome || `Tavolo ${tavolo.numero}`} · {tavolo.posti} posti</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                {ristorante.nome.charAt(0).toUpperCase()}
              </div>
              <div className="flex gap-1 rounded-full p-1" style={{ background: 'rgba(255,255,255,0.15)' }}>
                {(['menu', 'ordini'] as const).map(v => (
                  <button key={v} onClick={() => setVista(v)}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all relative capitalize"
                    style={vista === v ? { background: '#fff', color: brandColor } : { color: 'rgba(255,255,255,0.85)' }}>
                    {v === 'menu' ? 'Menu' : 'Ordini'}
                    {v === 'ordini' && ordiniInviati.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{ordiniInviati.length}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {vista === 'menu' && (
            <div className="flex gap-2 pb-3 overflow-x-auto mt-3" style={{ scrollbarWidth: 'none' }}>
              {categorie.map((c: any) => (
                <button key={c.id} onClick={() => scrollToCategoria(c.id)}
                  className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap"
                  style={categoriaAttiva === c.id ? { background: '#fff', color: brandColor } : { background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                  {c.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* VISTA MENU */}
      {vista === 'menu' && (
        <div className="px-4 pt-6 flex flex-col gap-8">
          {categorie.map((cat: any) => {
            const piattiCat = piatti.filter(p => p.categoriaId === cat.id)
            if (piattiCat.length === 0) return null
            return (
              <div key={cat.id} ref={el => { sectionRefs.current[cat.id] = el }}>
                <div className="flex items-center mb-4 pb-3" style={{ borderBottom: `2px solid ${brandColor}` }}>
                  <h2 className="text-xl font-bold" style={{ color: brandText }}>{cat.nome}</h2>
                  <span className="ml-2 text-sm text-gray-400 font-normal">({piattiCat.length})</span>
                </div>
                <div className="flex flex-col gap-3">
                  {piattiCat.map(p => {
                    const inCarrello = carrello.find(i => i.piatto.id === p.id)
                    return (
                      <div key={p.id} className="bg-white rounded-2xl p-4 flex items-center justify-between" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                        <div className="flex-1 mr-4">
                          <h3 className="font-semibold text-gray-900 text-base">{p.nome}</h3>
                          {p.descrizione && <p className="text-sm text-gray-500 mt-0.5 leading-snug">{p.descrizione}</p>}
                          <p className="text-base font-bold mt-2" style={{ color: brandColor }}>€ {p.prezzo.toFixed(2)}</p>
                        </div>
                        {inCarrello ? (
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <button onClick={() => rimuovi(p.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: brandColor }}>−</button>
                            <span className="font-bold text-base w-5 text-center text-gray-800">{inCarrello.quantita}</span>
                            <button onClick={() => aggiungi(p)} className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: brandColor }}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => aggiungi(p)} className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0" style={{ background: brandColor, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>+</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* VISTA ORDINI */}
      {vista === 'ordini' && (
        <div className="px-4 pt-6 flex flex-col gap-4">
          {ordiniInviati.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-3">🍽️</p>
              <p className="text-gray-500 mb-4">Nessun ordine ancora</p>
              <button onClick={() => setVista('menu')} className="px-6 py-3 rounded-2xl text-white font-semibold" style={{ background: brandColor }}>Vai al menu</button>
            </div>
          ) : (
            <>
              {ordiniInviati.map(ordine => {
                const s = statoLabel(ordine.stato)
                const puoAnnullare = ordine.stato === 'in_attesa_pagamento' || (ordine.tempoRimasto > 0 && ordine.stato === 'ricevuto')
                return (
                  <div key={ordine.id} className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${s.color}`}>{s.label}</span>
                      <div className="flex items-center gap-2">
                        {ordine.metodoPagamento && (
                          <span className="text-xs text-gray-500">{metodoPagamentoLabel(ordine.metodoPagamento)}</span>
                        )}
                        <span className="text-xs text-gray-400">{new Date(ordine.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 mb-4">
                      {ordine.righe.map((riga, idx) => {
                        const rs = statoLabel(riga.stato)
                        return (
                          <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-50">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center" style={{ background: brandColor }}>{riga.quantita}</span>
                              <span className="text-sm font-medium text-gray-800">{riga.nome}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rs.color}`}>{rs.label}</span>
                              <span className="text-sm text-gray-500 font-medium">€ {(riga.prezzo * riga.quantita).toFixed(2)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <span className="font-bold text-gray-800">Totale: <span style={{ color: brandColor }}>€ {ordine.totale.toFixed(2)}</span></span>
                      {puoAnnullare && (
                        <button onClick={() => annullaOrdine(ordine.id)} className="flex items-center gap-2 text-sm text-red-500 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-50">
                          Annulla
                          <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-mono">
                            {Math.floor(ordine.tempoRimasto / 60)}:{String(ordine.tempoRimasto % 60).padStart(2, '0')}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              <button onClick={() => setVista('menu')} className="w-full py-3 rounded-2xl border-2 border-dashed text-sm font-semibold" style={{ borderColor: brandColor, color: brandColor }}>
                + Aggiungi altri piatti
              </button>
            </>
          )}
        </div>
      )}

      {/* BARRA CARRELLO */}
      {carrello.length > 0 && !mostraCarrello && (
        <div className="fixed bottom-6 left-4 right-4 z-40">
          <button onClick={() => setMostraCarrello(true)} className="w-full py-4 rounded-2xl text-white font-bold shadow-xl flex items-center justify-between px-6" style={{ background: brandColor }}>
            <span className="rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(255,255,255,0.25)' }}>{quantita}</span>
            <span className="text-base">Vedi ordine</span>
            <span>€ {totale.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* MODALE CARRELLO */}
      {mostraCarrello && !schermaPagamento && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMostraCarrello(false)} />
          <div className="relative bg-white rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-800 text-xl">Il tuo ordine</h2>
              <button onClick={() => setMostraCarrello(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            {tavolo && <div className="rounded-xl px-4 py-2 mb-5 text-sm text-gray-600" style={{ background: '#f5f5f5' }}>Tavolo {tavolo.numero} · {tavolo.posti} posti</div>}
            <div className="flex flex-col gap-4 mb-6">
              {carrello.map(item => (
                <div key={item.piatto.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{item.piatto.nome}</p>
                    <p className="text-sm text-gray-400">€ {item.piatto.prezzo.toFixed(2)} cad.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => rimuovi(item.piatto.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg" style={{ background: brandColor }}>−</button>
                    <span className="font-bold w-5 text-center text-gray-800">{item.quantita}</span>
                    <button onClick={() => aggiungi(item.piatto)} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg" style={{ background: brandColor }}>+</button>
                    <span className="font-bold text-gray-800 w-16 text-right">€ {(item.piatto.prezzo * item.quantita).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-4 mb-6 flex justify-between items-center">
              <span className="font-bold text-gray-800 text-lg">Totale</span>
              <span className="font-bold text-xl" style={{ color: brandColor }}>€ {totale.toFixed(2)}</span>
            </div>
            <button onClick={() => setSchermaPagamento(true)}
              className="w-full py-4 rounded-2xl text-white font-bold text-lg" style={{ background: brandColor }}>
              Continua →
            </button>
          </div>
        </div>
      )}

      {/* SCHERMATA PAGAMENTO */}
      {mostraCarrello && schermaPagamento && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setMostraCarrello(false); setSchermaPagamento(false) }} />
          <div className="relative bg-white rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setSchermaPagamento(false)} className="text-gray-400 text-sm flex items-center gap-1">← Indietro</button>
              <button onClick={() => { setMostraCarrello(false); setSchermaPagamento(false) }} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <h2 className="font-bold text-gray-800 text-xl mb-2">Come vuoi pagare?</h2>
            <div className="rounded-xl px-4 py-2 mb-6 text-sm text-gray-600 flex justify-between" style={{ background: '#f5f5f5' }}>
              <span>{quantita} {quantita === 1 ? 'piatto' : 'piatti'}</span>
              <span className="font-bold" style={{ color: brandColor }}>€ {totale.toFixed(2)}</span>
            </div>

            <div className="flex flex-col gap-3 mb-6">
              {metodi.map(metodo => (
                <button key={metodo.id}
                  onClick={() => inviaOrdine(metodo.id)}
                  disabled={inviando}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50 text-left"
                >
                  <span className="text-3xl">{metodo.icon}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{metodo.label}</p>
                    <p className="text-sm text-gray-500">{metodo.desc}</p>
                  </div>
                  <span className="text-gray-300 text-xl">→</span>
                </button>
              ))}
            </div>

            {metodi.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p>Nessun metodo di pagamento disponibile</p>
                <p className="text-sm mt-1">Contatta il personale del ristorante</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
