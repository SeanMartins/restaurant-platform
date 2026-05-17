'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import { getRistorante, ascoltaOrdiniCassa, aggiornaTavolo } from '@/lib/firestore'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Ordine } from '@/types'
import toast from 'react-hot-toast'

export default function CassaPageClient() {
  const { appUser, loading, logout } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const restaurantIdParam = searchParams.get('r')

  const [ristorante, setRistorante]   = useState<Ristorante | null>(null)
  const [ordini, setOrdini]           = useState<Ordine[]>([])
  const [loadingDati, setLoadingDati] = useState(true)
  const [tavoloSelezionato, setTavoloSelezionato] = useState<number | null>(null)
  const [accessoRapido, setAccessoRapido] = useState(false)
  const [restaurantIdEffettivo, setRestaurantIdEffettivo] = useState<string | null>(null)

  useEffect(() => {
    if (restaurantIdParam) {
      const sessione = sessionStorage.getItem(`accesso_${restaurantIdParam}_cassa`)
      if (sessione) {
        setAccessoRapido(true)
        setRestaurantIdEffettivo(restaurantIdParam)
        return
      } else {
        router.replace(`/accesso/cassa?r=${restaurantIdParam}`)
        return
      }
    }
    if (!loading && !appUser) { router.replace('/login'); return }
    if (appUser?.restaurantId) setRestaurantIdEffettivo(appUser.restaurantId)
  }, [appUser, loading, restaurantIdParam])

  useEffect(() => {
    if (!restaurantIdEffettivo) return
    getRistorante(restaurantIdEffettivo).then(r => {
      setRistorante(r)
      setLoadingDati(false)
    })
  }, [restaurantIdEffettivo])

  useEffect(() => {
    if (!restaurantIdEffettivo) return
    const unsub = ascoltaOrdiniCassa(restaurantIdEffettivo, setOrdini)
    return () => unsub()
  }, [restaurantIdEffettivo])

  const ordiniPerTavolo = ordini.reduce((acc, ordine) => {
    const num = ordine.tavoloNumero
    if (!acc[num]) acc[num] = []
    acc[num].push(ordine)
    return acc
  }, {} as Record<number, Ordine[]>)

  const tavoli = Object.keys(ordiniPerTavolo).map(Number).sort((a, b) => a - b)

  const totaleTavolo = (numero: number) =>
    ordiniPerTavolo[numero].reduce((sum, o) => sum + o.totale, 0)

  const tuttiPronti = (numero: number) =>
    ordiniPerTavolo[numero].every(o => o.righe.every(r => r.stato === 'pronto' || r.stato === 'servito'))

  const chiudiTavolo = async (numero: number) => {
    if (!restaurantIdEffettivo) return
    if (!confirm(`Chiudere il conto del Tavolo ${numero}? Totale: € ${totaleTavolo(numero).toFixed(2)}`)) return
    try {
      for (const ordine of ordiniPerTavolo[numero]) {
        await updateDoc(doc(db, 'ristoranti', restaurantIdEffettivo, 'ordini', ordine.id), {
          stato: 'servito', updatedAt: new Date().toISOString()
        })
      }
      toast.success(`Tavolo ${numero} chiuso! ✓`)
      setTavoloSelezionato(null)
    } catch { toast.error('Errore nella chiusura') }
  }

  const esci = () => {
    if (accessoRapido && restaurantIdEffettivo) {
      sessionStorage.removeItem(`accesso_${restaurantIdEffettivo}_cassa`)
      router.replace(`/accesso/cassa?r=${restaurantIdEffettivo}`)
    } else { logout() }
  }

  if (loading || loadingDati) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const tavoloOrdini = tavoloSelezionato ? ordiniPerTavolo[tavoloSelezionato] || [] : []
  const tavoloTotale = tavoloSelezionato ? totaleTavolo(tavoloSelezionato) : 0

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">💰</span>
          <div>
            <h1 className="font-bold text-xl">Cassa</h1>
            <p className="text-gray-400 text-sm">{ristorante?.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-green-400 text-gray-900 font-bold px-3 py-1 rounded-full text-sm">
            {tavoli.length} tavoli attivi
          </div>
          <button onClick={esci} className="text-gray-400 hover:text-white text-sm">Esci</button>
        </div>
      </header>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold text-gray-300 mb-4">Tavoli con ordini</h2>
          {tavoli.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">💰</p>
              <p className="text-gray-500">Nessun tavolo attivo</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tavoli.map(num => (
                <button key={num}
                  onClick={() => setTavoloSelezionato(tavoloSelezionato === num ? null : num)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    tavoloSelezionato === num ? 'border-green-400 bg-green-900/30'
                      : tuttiPronti(num) ? 'border-green-600 bg-gray-800 hover:border-green-400'
                      : 'border-yellow-600 bg-gray-800 hover:border-yellow-400'
                  }`}>
                  <div className="text-2xl font-black mb-1">T{num}</div>
                  <div className="text-green-400 font-bold text-lg">€ {totaleTavolo(num).toFixed(2)}</div>
                  <div className={`text-xs mt-1 ${tuttiPronti(num) ? 'text-green-400' : 'text-yellow-400'}`}>
                    {tuttiPronti(num) ? '✓ Tutto pronto' : '⏳ In preparazione'}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">{ordiniPerTavolo[num].length} ordini</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {tavoloSelezionato && (
          <div className="bg-gray-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-xl">Tavolo {tavoloSelezionato}</h2>
              <button onClick={() => setTavoloSelezionato(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex flex-col gap-2 mb-6 max-h-64 overflow-y-auto">
              {tavoloOrdini.flatMap(o => o.righe).map((riga, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-700">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      riga.stato === 'pronto' || riga.stato === 'servito' ? 'bg-green-500 text-white' : 'bg-yellow-400 text-gray-900'
                    }`}>{riga.quantita}</span>
                    <span className="text-sm">{riga.nome}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${riga.stato === 'pronto' || riga.stato === 'servito' ? 'text-green-400' : 'text-yellow-400'}`}>
                      {riga.stato === 'pronto' || riga.stato === 'servito' ? '✓ Pronto' : '⏳'}
                    </span>
                    <span className="text-gray-300 text-sm font-medium">€ {(riga.prezzo * riga.quantita).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-700 pt-4 mb-6">
              <div className="flex justify-between text-xl font-bold">
                <span>Totale</span>
                <span className="text-green-400">€ {tavoloTotale.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={() => chiudiTavolo(tavoloSelezionato)}
              className="w-full py-4 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl text-lg transition-colors">
              ✓ Chiudi conto — € {tavoloTotale.toFixed(2)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
