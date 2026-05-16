'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { getRistoranteBySlug, getCategorie, getPiatti, getTavoli, creaOrdine } from '@/lib/firestore'
import type { Ristorante, Categoria, Piatto, Tavolo, RigaOrdine } from '@/types'
import toast from 'react-hot-toast'

interface CarrelloItem {
  piatto: Piatto
  quantita: number
  note: string
}

export default function MenuPubblico({ params }: { params: { restaurantSlug: string } }) {
  const searchParams = useSearchParams()
  const tavoloId     = searchParams.get('tavolo')
  const tavoloNum    = searchParams.get('n')

  const [ristorante, setRistorante] = useState<Ristorante | null>(null)
  const [categorie, setCategorie]   = useState<Categoria[]>([])
  const [piatti, setPiatti]         = useState<Piatto[]>([])
  const [tavolo, setTavolo]         = useState<Tavolo | null>(null)
  const [loading, setLoading]       = useState(true)
  const [categoriaAttiva, setCategoriaAttiva] = useState<string>('')
  const [carrello, setCarrello]     = useState<CarrelloItem[]>([])
  const [mostraCarrello, setMostraCarrello] = useState(false)
  const [inviando, setInviando]     = useState(false)
  const [ordinato, setOrdinato]     = useState(false)

  useEffect(() => {
    caricaDati()
  }, [params.restaurantSlug])

  const caricaDati = async () => {
    const r = await getRistoranteBySlug(params.restaurantSlug)
    if (!r || !r.attivo) { setLoading(false); return }
    setRistorante(r)

    const [cats, platti, tavoli] = await Promise.all([
      getCategorie(r.id),
      getPiatti(r.id),
      getTavoli(r.id)
    ])

    const catsAttive = cats.filter(c => c.attiva)
    setCategorie(catsAttive)
    setPiatti(platti.filter(p => p.disponibile))
    if (catsAttive.length > 0) setCategoriaAttiva(catsAttive[0].id)

    if (tavoloId) {
      const t = tavoli.find(t => t.id === tavoloId)
      if (t) setTavolo(t)
    }
    setLoading(false)
  }

  // Applica colori brand come CSS variables
  useEffect(() => {
    if (!ristorante) return
    document.documentElement.style.setProperty('--brand-primary',   ristorante.colori.primario)
    document.documentElement.style.setProperty('--brand-secondary', ristorante.colori.secondario)
    document.documentElement.style.setProperty('--brand-bg',        ristorante.colori.sfondo)
    document.documentElement.style.setProperty('--brand-text',      ristorante.colori.testo)
    document.documentElement.style.setProperty('--brand-font',      ristorante.font || 'Inter')
  }, [ristorante])

  const aggiungiAlCarrello = (piatto: Piatto) => {
    setCarrello(prev => {
      const esistente = prev.find(i => i.piatto.id === piatto.id)
      if (esistente) {
        return prev.map(i => i.piatto.id === piatto.id
          ? { ...i, quantita: i.quantita + 1 }
          : i
        )
      }
      return [...prev, { piatto, quantita: 1, note: '' }]
    })
    toast.success(`${piatto.nome} aggiunto!`, { duration: 1000 })
  }

  const rimuoviDalCarrello = (piattoId: string) => {
    setCarrello(prev => {
      const item = prev.find(i => i.piatto.id === piattoId)
      if (!item) return prev
      if (item.quantita === 1) return prev.filter(i => i.piatto.id !== piattoId)
      return prev.map(i => i.piatto.id === piattoId
        ? { ...i, quantita: i.quantita - 1 }
        : i
      )
    })
  }

  const totaleCarrello = carrello.reduce((sum, i) => sum + i.piatto.prezzo * i.quantita, 0)
  const quantitaTotale = carrello.reduce((sum, i) => sum + i.quantita, 0)

  const inviaOrdine = async () => {
    if (!ristorante || !tavoloId || carrello.length === 0) return
    setInviando(true)
    try {
      const righe: RigaOrdine[] = carrello.map(item => ({
        piattoId:  item.piatto.id,
        nome:      item.piatto.nome,
        prezzo:    item.piatto.prezzo,
        quantita:  item.quantita,
        reparto:   item.piatto.reparto,
        note:      item.note,
        stato:     'ricevuto'
      }))
      await creaOrdine(ristorante.id, {
        tavoloId,
        tavoloNumero: tavolo?.numero || parseInt(tavoloNum || '0'),
        righe,
        totale: totaleCarrello,
        stato: 'ricevuto'
      })
      setCarrello([])
      setMostraCarrello(false)
      setOrdinato(true)
      setTimeout(() => setOrdinato(false), 4000)
    } catch {
      toast.error('Errore nell\'invio ordine')
    } finally {
      setInviando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--brand-bg)' }}>
      <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand-primary)' }} />
    </div>
  )

  if (!ristorante) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl mb-4">🍽️</p>
        <p className="text-gray-500">Ristorante non trovato</p>
      </div>
    </div>
  )

  const piattiCategoria = piatti.filter(p => p.categoriaId === categoriaAttiva)

  return (
    <div className="min-h-screen pb-32" style={{
      background: 'var(--brand-bg)',
      color: 'var(--brand-text)',
      fontFamily: 'var(--brand-font)'
    }}>

      {/* Header */}
      <div className="sticky top-0 z-10 shadow-sm" style={{ background: 'var(--brand-bg)' }}>
        <div className="px-4 pt-6 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: 'var(--brand-primary)' }}
            >
              {ristorante.nome.charAt(0)}
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{ristorante.nome}</h1>
              {tavolo && (
                <p className="text-sm opacity-60">
                  {tavolo.nome || `Tavolo ${tavolo.numero}`} · {tavolo.posti} posti
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Categorie scroll orizzontale */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {categorie.map(c => (
            <button
              key={c.id}
              onClick={() => setCategoriaAttiva(c.id)}
              className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all"
              style={categoriaAttiva === c.id
                ? { background: 'var(--brand-primary)', color: '#fff' }
                : { background: 'transparent', color: 'var(--brand-text)', border: '1px solid var(--brand-primary)', opacity: 0.7 }
              }
            >
              {c.nome}
            </button>
          ))}
        </div>
      </div>

      {/* Lista piatti */}
      <div className="px-4 pt-4">
        {piattiCategoria.length === 0 ? (
          <div className="text-center py-16 opacity-50">
            <p className="text-4xl mb-2">🍽️</p>
            <p>Nessun piatto disponibile</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {piattiCategoria.map(p => {
              const inCarrello = carrello.find(i => i.piatto.id === p.id)
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between"
                  style={{ background: 'rgba(255,255,255,0.8)' }}
                >
                  <div className="flex-1 mr-4">
                    <h3 className="font-semibold">{p.nome}</h3>
                    {p.descrizione && (
                      <p className="text-sm opacity-60 mt-0.5">{p.descrizione}</p>
                    )}
                    <p className="font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
                      € {p.prezzo.toFixed(2)}
                    </p>
                  </div>

                  {/* Controllo quantità */}
                  {inCarrello ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => rimuoviDalCarrello(p.id)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ background: 'var(--brand-primary)' }}
                      >
                        −
                      </button>
                      <span className="font-bold w-4 text-center">{inCarrello.quantita}</span>
                      <button
                        onClick={() => aggiungiAlCarrello(p)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ background: 'var(--brand-primary)' }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => aggiungiAlCarrello(p)}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md"
                      style={{ background: 'var(--brand-primary)' }}
                    >
                      +
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Messaggio ordine inviato */}
      {ordinato && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-green-500 text-white rounded-2xl p-4 text-center shadow-xl">
          <p className="text-xl mb-1">🎉 Ordine inviato!</p>
          <p className="text-sm opacity-90">Il tuo ordine è in preparazione</p>
        </div>
      )}

      {/* Carrello fisso in basso */}
      {carrello.length > 0 && !mostraCarrello && (
        <div className="fixed bottom-6 left-4 right-4 z-40">
          <button
            onClick={() => setMostraCarrello(true)}
            className="w-full py-4 rounded-2xl text-white font-bold shadow-xl flex items-center justify-between px-6"
            style={{ background: 'var(--brand-primary)' }}
          >
            <span className="bg-white bg-opacity-30 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
              {quantitaTotale}
            </span>
            <span>Vedi ordine</span>
            <span>€ {totaleCarrello.toFixed(2)}</span>
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

            {tavolo && (
              <div className="bg-gray-50 rounded-xl px-4 py-2 mb-4 text-sm text-gray-600">
                📍 {tavolo.nome || `Tavolo ${tavolo.numero}`}
              </div>
            )}

            <div className="flex flex-col gap-3 mb-6">
              {carrello.map(item => (
                <div key={item.piatto.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{item.piatto.nome}</p>
                    <p className="text-sm text-gray-400">€ {item.piatto.prezzo.toFixed(2)} cad.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => rimuoviDalCarrello(item.piatto.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm"
                      style={{ background: 'var(--brand-primary)' }}
                    >
                      −
                    </button>
                    <span className="font-bold w-4 text-center">{item.quantita}</span>
                    <button
                      onClick={() => aggiungiAlCarrello(item.piatto)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm"
                      style={{ background: 'var(--brand-primary)' }}
                    >
                      +
                    </button>
                    <span className="font-semibold text-gray-800 w-16 text-right">
                      € {(item.piatto.prezzo * item.quantita).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4 mb-6">
              <div className="flex justify-between font-bold text-lg">
                <span>Totale</span>
                <span style={{ color: 'var(--brand-primary)' }}>€ {totaleCarrello.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={inviaOrdine}
              disabled={inviando}
              className="w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg disabled:opacity-50"
              style={{ background: 'var(--brand-primary)' }}
            >
              {inviando ? 'Invio in corso...' : '🍽️ Invia ordine alla cucina'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
