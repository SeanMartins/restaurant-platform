'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { Ristorante, BillingRistorante } from '@/types'
import toast from 'react-hot-toast'

// Gestione manuale dell'abbonamento (solo superadmin), es. piloti gratuiti.
// Passa da /api/admin/billing: config/billing non è scrivibile dal client.
const MESI_PILOTA = 3

function traMesi(mesi: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + mesi)
  // Data locale (non toISOString, che è in UTC e vicino a mezzanotte sbaglia giorno)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AbbonamentoAdmin({ ristorante }: { ristorante: Ristorante }) {
  const { user } = useAuth()
  const [billing, setBilling]   = useState<Partial<BillingRistorante> | null>(null)
  const [form, setForm]         = useState({ piano: 'base', statoAbbonamento: 'attivo', scadenza: '' })
  const [caricando, setCaricando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carica() }, [ristorante.id])

  const chiamaApi = async (init?: RequestInit) => {
    const idToken = await user?.getIdToken()
    const url = init ? '/api/admin/billing' : `/api/admin/billing?restaurantId=${encodeURIComponent(ristorante.id)}`
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    })
    const dati = await res.json()
    if (!dati.success) throw new Error(dati.error)
    return dati.billing as Partial<BillingRistorante> | null
  }

  const aggiornaStato = (b: Partial<BillingRistorante> | null) => {
    setBilling(b)
    setForm({
      piano: b?.piano || 'base',
      statoAbbonamento: b?.statoAbbonamento || 'attivo',
      scadenza: b?.scadenza || '',
    })
  }

  const carica = async () => {
    setCaricando(true)
    try { aggiornaStato(await chiamaApi()) }
    catch { toast.error('Errore nel caricamento dell\'abbonamento') }
    finally { setCaricando(false) }
  }

  const salva = async (valori = form) => {
    setSalvando(true)
    try {
      aggiornaStato(await chiamaApi({
        method: 'POST',
        body: JSON.stringify({ restaurantId: ristorante.id, ...valori }),
      }))
      toast.success('Abbonamento aggiornato!')
    } catch (err: any) { toast.error(err.message || 'Errore nel salvataggio') }
    finally { setSalvando(false) }
  }

  const attivaPilota = () => {
    const scadenza = traMesi(MESI_PILOTA)
    if (!confirm(`Attivare un pilota gratuito di ${MESI_PILOTA} mesi (piano ${form.piano}, scadenza ${scadenza})?`)) return
    salva({ ...form, statoAbbonamento: 'attivo', scadenza })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
      <h3 className="font-semibold text-gray-800 mb-1">Abbonamento</h3>
      {caricando ? (
        <p className="text-sm text-gray-400">Caricamento…</p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-5">
            {billing
              ? <>Attuale: piano <b>{billing.piano || '—'}</b>, stato <b>{billing.statoAbbonamento || '—'}</b>
                  {billing.scadenza && <>, scade il <b>{new Date(billing.scadenza).toLocaleDateString('it-IT')}</b></>}
                  {billing.stripeSubscriptionId && <> · abbonamento Stripe</>}</>
              : 'Nessun abbonamento registrato'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Piano</label>
              <select value={form.piano} onChange={e => setForm(f => ({ ...f, piano: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="base">Base</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
              <select value={form.statoAbbonamento} onChange={e => setForm(f => ({ ...f, statoAbbonamento: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="attivo">Attivo</option>
                <option value="scaduto">Scaduto</option>
                <option value="cancellato">Cancellato</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scadenza</label>
              <input type="date" value={form.scadenza} onChange={e => setForm(f => ({ ...f, scadenza: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => salva()} disabled={salvando}
              className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold disabled:opacity-50">
              {salvando ? 'Salvataggio…' : 'Salva abbonamento'}
            </button>
            <button onClick={attivaPilota} disabled={salvando}
              className="flex-1 py-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-semibold disabled:opacity-50">
              🎁 Pilota gratuito {MESI_PILOTA} mesi
            </button>
          </div>
        </>
      )}
    </div>
  )
}
