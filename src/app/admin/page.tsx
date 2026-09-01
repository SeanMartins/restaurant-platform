'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { getTuttiRistoranti, creaRistorante, aggiornaRistorante, getRistoranteBySlug } from '@/lib/firestore'
import type { Ristorante } from '@/types'
import toast from 'react-hot-toast'
import MenuManager from '@/components/manager/MenuManager'
import TavoliManager from '@/components/manager/TavoliManager'
import GraficaManager from '@/components/manager/GraficaManager'
import OperatoriManager from '@/components/manager/OperatoriManager'
import StatisticheManager from '@/components/manager/StatisticheManager'
import PagamentiManager from '@/components/manager/PagamentiManager'

type VistaAdmin = 'lista' | 'nuovo' | 'manager' | 'gestisci'
type SezioneGestisci = 'info' | 'statistiche' | 'menu' | 'tavoli' | 'grafica' | 'pagamenti' | 'operatori'

export default function AdminPage() {
  const { appUser, loading, logout } = useAuth()
  const router = useRouter()
  const [ristoranti, setRistoranti]   = useState<Ristorante[]>([])
  const [vista, setVista]             = useState<VistaAdmin>('lista')
  const [loadingDati, setLoadingDati] = useState(true)
  const [ristoranteAttivo, setRistoranteAttivo] = useState<Ristorante | null>(null)
  const [sezione, setSezione]         = useState<SezioneGestisci>('info')

  // Forms
  const [formRistorante, setFormRistorante] = useState({
    nome: '', slug: '', indirizzo: '', telefono: '',
    colori: { primario: '#E63946', secondario: '#457B9D', sfondo: '#F1FAEE', testo: '#1D3557' }
  })
  const [formManager, setFormManager] = useState({ email: '', password: '', displayName: '', restaurantId: '' })
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

  const apriGestisci = (r: Ristorante) => {
    setRistoranteAttivo(r)
    setVista('gestisci')
    setSezione('info')
  }

  // ── RISTORANTE ──────────────────────────────────────────────────────────────
  const handleCreaRistorante = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const esistente = await getRistoranteBySlug(formRistorante.slug)
      if (esistente) {
        toast.error(`Lo slug "/${formRistorante.slug}" è già usato da "${esistente.nome}" — scegline un altro`)
        return
      }
      await creaRistorante({ ...formRistorante, attivo: true })
      toast.success(`Ristorante "${formRistorante.nome}" creato!`)
      setFormRistorante({ nome: '', slug: '', indirizzo: '', telefono: '',
        colori: { primario: '#E63946', secondario: '#457B9D', sfondo: '#F1FAEE', testo: '#1D3557' }
      })
      setVista('lista')
      caricaRistoranti()
    } catch { toast.error('Errore nella creazione') }
  }

  const salvaInfoRistorante = async () => {
    if (!ristoranteAttivo) return
    try {
      await aggiornaRistorante(ristoranteAttivo.id, {
        indirizzo: ristoranteAttivo.indirizzo,
        telefono: ristoranteAttivo.telefono,
      })
      toast.success('Ristorante aggiornato!')
      caricaRistoranti()
    } catch { toast.error('Errore nel salvataggio') }
  }

  const toggleAttivo = async (r: Ristorante) => {
    await aggiornaRistorante(r.id, { attivo: !r.attivo })
    toast.success(r.attivo ? 'Ristorante disattivato' : 'Ristorante attivato')
    caricaRistoranti()
    if (ristoranteAttivo?.id === r.id) setRistoranteAttivo({ ...ristoranteAttivo, attivo: !r.attivo })
  }

  // ── MANAGER ─────────────────────────────────────────────────────────────────
  const handleCreaManager = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreandoManager(true)
    try {
      const res = await fetch('/api/crea-utente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formManager, role: 'manager' })
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Manager creato! Email: ${formManager.email}`)
        setFormManager({ email: '', password: '', displayName: '', restaurantId: '' })
        setVista('lista')
      } else { toast.error(data.error || 'Errore creazione manager') }
    } catch { toast.error('Errore di rete') }
    finally { setCreandoManager(false) }
  }

  if (loading || loadingDati) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── VISTA GESTISCI RISTORANTE ────────────────────────────────────────────────
  if (vista === 'gestisci' && ristoranteAttivo) {
    const voci = [
      { id: 'info',        label: 'Info',          emoji: '⚙️' },
      { id: 'statistiche', label: 'Statistiche',   emoji: '📊' },
      { id: 'menu',        label: 'Menu',          emoji: '📋' },
      { id: 'tavoli',      label: 'Tavoli & QR',   emoji: '🪑' },
      { id: 'grafica',     label: 'Grafica',       emoji: '🎨' },
      { id: 'pagamenti',   label: 'Pagamenti',     emoji: '💳' },
      { id: 'operatori',   label: 'Operatori',     emoji: '👥' },
    ] as const

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setVista('lista')} className="text-gray-400 hover:text-gray-600 mr-2">
                ← Admin
              </button>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: ristoranteAttivo.colori.primario }}>
                {ristoranteAttivo.nome.charAt(0)}
              </div>
              <div>
                <h1 className="font-bold text-gray-800">{ristoranteAttivo.nome}</h1>
                <p className="text-xs text-gray-500">/{ristoranteAttivo.slug}</p>
              </div>
              <span className={`ml-2 text-xs px-2 py-1 rounded-full font-medium ${ristoranteAttivo.attivo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {ristoranteAttivo.attivo ? '● Attivo' : '○ Inattivo'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleAttivo(ristoranteAttivo)}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50">
                {ristoranteAttivo.attivo ? 'Disattiva' : 'Attiva'}
              </button>
              <a href={`/${ristoranteAttivo.slug}`} target="_blank" className="text-sm text-blue-500 hover:underline">
                Vedi menu ↗
              </a>
              <button onClick={logout} className="text-sm text-gray-500 hover:text-red-500">Esci</button>
            </div>
          </div>
        </header>

        {/* Navigazione sezioni */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex gap-1 overflow-x-auto">
              {voci.map(v => (
                <button key={v.id} onClick={() => setSezione(v.id)}
                  className={`px-5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    sezione === v.id ? 'border-red-500 text-red-500' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {v.emoji} {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* SEZIONE INFO — dati che non appartengono al pannello manager (slug, attivazione, ID) */}
          {sezione === 'info' && (
            <div className="max-w-2xl">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
                <h3 className="font-semibold text-gray-800 mb-5">Informazioni ristorante</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug URL <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-normal">🔒 Non modificabile</span></label>
                    <div className="flex items-center border border-gray-100 rounded-xl bg-gray-50">
                      <span className="px-3 py-3 text-gray-400 text-sm border-r border-gray-100">/</span>
                      <span className="px-3 py-3 text-gray-500 text-sm font-mono flex-1">{ristoranteAttivo.slug}</span>
                      <span className="px-3 text-gray-300">🔒</span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">⚠️ Lo slug non può essere modificato — i QR code dei tavoli smetterebbero di funzionare</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                    <input value={ristoranteAttivo.indirizzo || ''}
                      onChange={e => setRistoranteAttivo({ ...ristoranteAttivo, indirizzo: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                    <input value={ristoranteAttivo.telefono || ''}
                      onChange={e => setRistoranteAttivo({ ...ristoranteAttivo, telefono: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
                  </div>
                  <p className="text-xs text-gray-400">Nome, colori e font si modificano nella scheda "Grafica".</p>
                  <button onClick={salvaInfoRistorante}
                    className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold mt-2">
                    Salva modifiche
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="font-semibold text-gray-800 mb-2">URL pubblico menu</h3>
                <p className="text-sm text-gray-500 mb-3">Condividi questo link con il ristorante</p>
                <div className="bg-gray-50 rounded-xl px-4 py-3 font-mono text-sm text-blue-600 break-all">
                  {process.env.NEXT_PUBLIC_APP_URL}/{ristoranteAttivo.slug}
                </div>
                <p className="text-xs text-gray-400 mt-2">ID: {ristoranteAttivo.id}</p>
              </div>
            </div>
          )}

          {sezione === 'statistiche' && <StatisticheManager ristorante={ristoranteAttivo} />}
          {sezione === 'menu'        && <MenuManager ristorante={ristoranteAttivo} />}
          {sezione === 'tavoli'      && <TavoliManager ristorante={ristoranteAttivo} />}
          {sezione === 'grafica'     && <GraficaManager ristorante={ristoranteAttivo} onAggiorna={setRistoranteAttivo} />}
          {sezione === 'pagamenti'   && <PagamentiManager ristorante={ristoranteAttivo} />}
          {sezione === 'operatori'   && <OperatoriManager ristorante={ristoranteAttivo} />}
        </div>
      </div>
    )
  }

  // ── VISTA PRINCIPALE ADMIN ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
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
          <button onClick={logout} className="text-sm text-gray-500 hover:text-red-500">Esci</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex gap-3 mb-8">
          {([
            { id: 'lista',   label: `Ristoranti (${ristoranti.length})` },
            { id: 'nuovo',   label: '+ Nuovo ristorante' },
            { id: 'manager', label: '👤 Crea manager' },
          ] as const).map(v => (
            <button key={v.id} onClick={() => setVista(v.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                vista === v.id ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}>{v.label}</button>
          ))}
        </div>

        {/* LISTA RISTORANTI */}
        {vista === 'lista' && (
          <div>
            {ristoranti.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-5xl mb-4">🏪</p>
                <p className="text-gray-500 mb-4">Nessun ristorante ancora</p>
                <button onClick={() => setVista('nuovo')} className="bg-red-500 text-white px-6 py-3 rounded-xl font-medium">
                  Crea il primo ristorante
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {ristoranti.map(r => (
                  <div key={r.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                          style={{ backgroundColor: r.colori.primario }}>
                          {r.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h2 className="font-semibold text-gray-800">{r.nome}</h2>
                          <p className="text-sm text-gray-500">/{r.slug}</p>
                          {r.indirizzo && <p className="text-xs text-gray-400">{r.indirizzo}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${r.attivo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.attivo ? '● Attivo' : '○ Inattivo'}
                        </span>
                        {/* PULSANTE GESTISCI */}
                        <button onClick={() => apriGestisci(r)}
                          className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors">
                          Gestisci
                        </button>
                        <button onClick={() => toggleAttivo(r)}
                          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1 rounded-lg">
                          {r.attivo ? 'Disattiva' : 'Attiva'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-50 flex gap-6 text-xs text-gray-400">
                      <span>Creato: {new Date(r.createdAt).toLocaleDateString('it-IT')}</span>
                      <span>URL: <span className="font-mono text-blue-500">/{r.slug}</span></span>
                      <span>ID: <span className="font-mono">{r.id}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NUOVO RISTORANTE */}
        {vista === 'nuovo' && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm max-w-xl">
            <h2 className="font-bold text-gray-800 text-lg mb-6">Nuovo ristorante</h2>
            <form onSubmit={handleCreaRistorante} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input value={formRistorante.nome} onChange={e => setFormRistorante(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Da Mario" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug URL *</label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-red-400">
                  <span className="px-3 py-3 bg-gray-50 text-gray-400 text-sm border-r border-gray-200">/</span>
                  <input value={formRistorante.slug}
                    onChange={e => setFormRistorante(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                    placeholder="da-mario" required
                    className="flex-1 px-3 py-3 text-sm focus:outline-none"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo</label>
                <input value={formRistorante.indirizzo} onChange={e => setFormRistorante(f => ({ ...f, indirizzo: e.target.value }))}
                  placeholder="Via Roma 1, Milano"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Colori brand</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['primario', 'secondario', 'sfondo', 'testo'] as const).map(c => (
                    <div key={c} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                      <input type="color" value={formRistorante.colori[c]}
                        onChange={e => setFormRistorante(f => ({ ...f, colori: { ...f.colori, [c]: e.target.value }}))}
                        className="w-8 h-8 rounded cursor-pointer border-0"/>
                      <span className="text-xs text-gray-500 capitalize">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setVista('lista')}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600">Annulla</button>
                <button type="submit"
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold">
                  Crea ristorante
                </button>
              </div>
            </form>
          </div>
        )}

        {/* CREA MANAGER */}
        {vista === 'manager' && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm max-w-xl">
            <h2 className="font-bold text-gray-800 text-lg mb-2">Crea account manager</h2>
            <p className="text-sm text-gray-500 mb-6">Il manager gestirà autonomamente il suo ristorante.</p>
            <form onSubmit={handleCreaManager} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome e cognome</label>
                <input value={formManager.displayName} onChange={e => setFormManager(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="Mario Rossi" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={formManager.email} onChange={e => setFormManager(f => ({ ...f, email: e.target.value }))}
                  placeholder="mario@ristorante.it" required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" value={formManager.password} onChange={e => setFormManager(f => ({ ...f, password: e.target.value }))}
                  placeholder="minimo 6 caratteri" required minLength={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assegna ristorante *</label>
                <select value={formManager.restaurantId} onChange={e => setFormManager(f => ({ ...f, restaurantId: e.target.value }))}
                  required className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                  <option value="">Seleziona ristorante...</option>
                  {ristoranti.map(r => <option key={r.id} value={r.id}>{r.nome} (/{r.slug})</option>)}
                </select>
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setVista('lista')}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600">Annulla</button>
                <button type="submit" disabled={creandoManager || ristoranti.length === 0}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl text-sm font-semibold">
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
