'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { getTuttiRistoranti, creaRistorante, aggiornaRistorante } from '@/lib/firestore'
import type { Ristorante } from '@/types'
import toast from 'react-hot-toast'

export default function AdminPage() {
  const { appUser, loading, logout } = useAuth()
  const router = useRouter()
  const [ristoranti, setRistoranti]     = useState<Ristorante[]>([])
  const [vista, setVista]               = useState<'lista' | 'nuovo' | 'manager'>('lista')
  const [ristoranteSelezionato, setRistoranteSelezionato] = useState<Ristorante | null>(null)
  const [loadingDati, setLoadingDati]   = useState(true)

  // Form nuovo ristorante
  const [form, setForm] = useState({
    nome: '', slug: '', indirizzo: '', telefono: '',
    colori: { primario: '#E63946', secondario: '#457B9D', sfondo: '#F1FAEE', testo: '#1D3557' }
  })

  // Form nuovo manager
  const [formManager, setFormManager] = useState({
    email: '', password: '', displayName: '', restaurantId: ''
  })
  const [creandoManager, setCreandoManager] = useState(false)

  useEffect(() => {
    if (!loading && appUser?.role !== 'superadmin') router.replace('/login')
  }, [appUser, loading, router])

  useEffect(() => {
    if (appUser?.role === 'superadmin') caricaRistoranti()
  }, [appUser])

  const caricaRistoranti = async () => {
    setLoadingDati(true)
    const lista = await getTuttiRistoranti()
    setRistoranti(lista)
    setLoadingDati(false)
  }

  const handleCreaRistorante = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await creaRistorante({ ...form, attivo: true })
      toast.success(`Ristorante "${form.nome}" creato!`)
      setForm({ nome: '', slug: '', indirizzo: '', telefono: '',
        colori: { primario: '#E63946', secondario: '#457B9D', sfondo: '#F1FAEE', testo: '#1D3557' }
      })
      setVista('lista')
      caricaRistoranti()
    } catch (err) {
      toast.error('Errore nella creazione')
    }
  }

  const handleCreaManager = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreandoManager(true)
    try {
      const res = await fetch('/api/crea-utente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formManager, role: 'manager' })
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Manager creato! Email: ${formManager.email}`)
        setFormManager({ email: '', password: '', displayName: '', restaurantId: '' })
        setVista('lista')
      } else {
        toast.error(data.error || 'Errore creazione manager')
      }
    } catch {
      toast.error('Errore di rete')
    } finally {
      setCreandoManager(false)
    }
  }

  const toggleAttivo = async (r: Ristorante) => {
    await aggiornaRistorante(r.id, { attivo: !r.attivo })
    toast.success(r.attivo ? 'Ristorante disattivato' : 'Ristorante attivato')
    caricaRistoranti()
  }

  if (loading || loadingDati) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👑</span>
          <div>
            <h1 className="font-bold text-gray-800">Super Admin</h1>
            <p className="text-xs text-gray-500">{appUser?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{ristoranti.length} ristoranti</span>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-red-500 transition-colors">
            Esci
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Tab navigazione */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setVista('lista')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              vista === 'lista' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            🏪 Ristoranti ({ristoranti.length})
          </button>
          <button
            onClick={() => setVista('nuovo')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              vista === 'nuovo' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            ➕ Nuovo ristorante
          </button>
          <button
            onClick={() => setVista('manager')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              vista === 'manager' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            👤 Crea manager
          </button>
        </div>

        {/* VISTA: Lista ristoranti */}
        {vista === 'lista' && (
          <div>
            {ristoranti.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🏪</div>
                <p className="text-gray-500 mb-4">Nessun ristorante ancora</p>
                <button
                  onClick={() => setVista('nuovo')}
                  className="bg-red-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-red-600 transition-colors"
                >
                  Crea il primo ristorante
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {ristoranti.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Colore brand */}
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                          style={{ backgroundColor: r.colori.primario }}
                        >
                          {r.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h2 className="font-semibold text-gray-800">{r.nome}</h2>
                          <p className="text-sm text-gray-500">/{r.slug}</p>
                          {r.indirizzo && <p className="text-xs text-gray-400">{r.indirizzo}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          r.attivo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {r.attivo ? '● Attivo' : '○ Inattivo'}
                        </span>
                        <button
                          onClick={() => toggleAttivo(r)}
                          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1 rounded-lg transition-colors"
                        >
                          {r.attivo ? 'Disattiva' : 'Attiva'}
                        </button>
                        <div className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-lg font-mono">
                          ID: {r.id.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                    {/* Info aggiuntive */}
                    <div className="mt-4 pt-4 border-t border-gray-50 flex gap-6 text-xs text-gray-400">
                      <span>Creato: {new Date(r.createdAt).toLocaleDateString('it-IT')}</span>
                      <span>URL pubblico: <span className="font-mono text-blue-500">/{r.slug}</span></span>
                      <span>ID completo: <span className="font-mono">{r.id}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VISTA: Nuovo ristorante */}
        {vista === 'nuovo' && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm max-w-xl">
            <h2 className="font-bold text-gray-800 text-lg mb-6">Nuovo ristorante</h2>
            <form onSubmit={handleCreaRistorante} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome ristorante *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Da Mario"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug URL * <span className="text-gray-400 font-normal">(solo lettere, numeri, trattini)</span></label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-red-400">
                  <span className="px-3 py-3 bg-gray-50 text-gray-400 text-sm border-r border-gray-200">/</span>
                  <input
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                    placeholder="da-mario"
                    required
                    className="flex-1 px-3 py-3 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                <input
                  value={form.indirizzo}
                  onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))}
                  placeholder="Via Roma 1, Milano"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                <input
                  value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+39 02 1234567"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              {/* Colori brand */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Colori brand</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['primario', 'secondario', 'sfondo', 'testo'] as const).map(c => (
                    <div key={c} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                      <input
                        type="color"
                        value={form.colori[c]}
                        onChange={e => setForm(f => ({ ...f, colori: { ...f.colori, [c]: e.target.value }}))}
                        className="w-8 h-8 rounded cursor-pointer border-0"
                      />
                      <span className="text-xs text-gray-500 capitalize">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setVista('lista')}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Crea ristorante
                </button>
              </div>
            </form>
          </div>
        )}

        {/* VISTA: Crea manager */}
        {vista === 'manager' && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm max-w-xl">
            <h2 className="font-bold text-gray-800 text-lg mb-2">Crea account manager</h2>
            <p className="text-sm text-gray-500 mb-6">Il manager potrà gestire autonomamente il suo ristorante: menu, tavoli, QR code e grafica.</p>
            <form onSubmit={handleCreaManager} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome e cognome</label>
                <input
                  value={formManager.displayName}
                  onChange={e => setFormManager(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="Mario Rossi"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={formManager.email}
                  onChange={e => setFormManager(f => ({ ...f, email: e.target.value }))}
                  placeholder="mario@ristorante.it"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={formManager.password}
                  onChange={e => setFormManager(f => ({ ...f, password: e.target.value }))}
                  placeholder="minimo 6 caratteri"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assegna ristorante *</label>
                <select
                  value={formManager.restaurantId}
                  onChange={e => setFormManager(f => ({ ...f, restaurantId: e.target.value }))}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                >
                  <option value="">Seleziona ristorante...</option>
                  {ristoranti.map(r => (
                    <option key={r.id} value={r.id}>{r.nome} (/{r.slug})</option>
                  ))}
                </select>
                {ristoranti.length === 0 && (
                  <p className="text-xs text-orange-500 mt-1">⚠️ Crea prima un ristorante</p>
                )}
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setVista('lista')}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={creandoManager || ristoranti.length === 0}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  {creandoManager ? 'Creazione...' : 'Crea manager'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
