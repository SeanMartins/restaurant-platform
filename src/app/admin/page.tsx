'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { getTuttiRistoranti, creaRistorante, aggiornaRistorante, getCategorie, getPiatti, getTavoli, creaPiatto, aggiornaPiatto, creaTavolo } from '@/lib/firestore'
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Piatto, Categoria, Tavolo } from '@/types'
import toast from 'react-hot-toast'

type VistaAdmin = 'lista' | 'nuovo' | 'manager' | 'gestisci'
type SezioneGestisci = 'menu' | 'tavoli' | 'grafica' | 'info'

export default function AdminPage() {
  const { appUser, loading, logout } = useAuth()
  const router = useRouter()
  const [ristoranti, setRistoranti]   = useState<Ristorante[]>([])
  const [vista, setVista]             = useState<VistaAdmin>('lista')
  const [loadingDati, setLoadingDati] = useState(true)
  const [ristoranteAttivo, setRistoranteAttivo] = useState<Ristorante | null>(null)
  const [sezione, setSezione]         = useState<SezioneGestisci>('info')

  // Dati ristorante attivo
  const [categorie, setCategorie]     = useState<Categoria[]>([])
  const [piatti, setPiatti]           = useState<Piatto[]>([])
  const [tavoli, setTavoli]           = useState<Tavolo[]>([])
  const [repartoAttivo, setRepartoAttivo] = useState<string>('cucina')

  // Forms
  const [formRistorante, setFormRistorante] = useState({
    nome: '', slug: '', indirizzo: '', telefono: '',
    colori: { primario: '#E63946', secondario: '#457B9D', sfondo: '#F1FAEE', testo: '#1D3557' }
  })
  const [formManager, setFormManager] = useState({ email: '', password: '', displayName: '', restaurantId: '' })
  const [formPiatto, setFormPiatto]   = useState({ nome: '', descrizione: '', prezzo: '', categoriaId: '', disponibile: true })
  const [modalePiatto, setModalePiatto] = useState(false)
  const [piattoEdit, setPiattoEdit]   = useState<Piatto | null>(null)
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

  const apriGestisci = async (r: Ristorante) => {
    setRistoranteAttivo(r)
    setVista('gestisci')
    setSezione('info')
    await caricaDatiRistorante(r)
  }

  const caricaDatiRistorante = async (r: Ristorante) => {
    const [cats, platti, tavs] = await Promise.all([
      getCategorie(r.id), getPiatti(r.id), getTavoli(r.id)
    ])
    setCategorie(cats)
    setPiatti(platti)
    setTavoli(tavs)
  }

  // ── RISTORANTE ──────────────────────────────────────────────────────────────
  const handleCreaRistorante = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
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
        nome: ristoranteAttivo.nome,
        indirizzo: ristoranteAttivo.indirizzo,
        telefono: ristoranteAttivo.telefono,
        colori: ristoranteAttivo.colori,
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

  // ── PIATTI ──────────────────────────────────────────────────────────────────
  const apriNuovoPiatto = () => {
    setPiattoEdit(null)
    setFormPiatto({ nome: '', descrizione: '', prezzo: '', categoriaId: '', disponibile: true })
    setModalePiatto(true)
  }

  const apriModificaPiatto = (p: Piatto) => {
    setPiattoEdit(p)
    setFormPiatto({ nome: p.nome, descrizione: p.descrizione || '', prezzo: String(p.prezzo), categoriaId: p.categoriaId, disponibile: p.disponibile })
    setModalePiatto(true)
  }

  const salvaPiatto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ristoranteAttivo) return
    try {
      const dati = { nome: formPiatto.nome, descrizione: formPiatto.descrizione, prezzo: parseFloat(formPiatto.prezzo), categoriaId: formPiatto.categoriaId, reparto: repartoAttivo as any, disponibile: formPiatto.disponibile, ordine: piatti.length }
      if (piattoEdit) { await aggiornaPiatto(ristoranteAttivo.id, piattoEdit.id, dati); toast.success('Piatto aggiornato!') }
      else { await creaPiatto(ristoranteAttivo.id, dati); toast.success('Piatto aggiunto!') }
      setModalePiatto(false)
      await caricaDatiRistorante(ristoranteAttivo)
    } catch { toast.error('Errore nel salvataggio') }
  }

  const eliminaPiatto = async (p: Piatto) => {
    if (!ristoranteAttivo || !confirm(`Eliminare "${p.nome}"?`)) return
    await deleteDoc(doc(db, 'ristoranti', ristoranteAttivo.id, 'piatti', p.id))
    toast.success('Piatto eliminato')
    await caricaDatiRistorante(ristoranteAttivo)
  }

  const creaCategoria = async () => {
    if (!ristoranteAttivo) return
    const nome = prompt('Nome categoria:')
    if (!nome) return
    const ref = doc(collection(db, 'ristoranti', ristoranteAttivo.id, 'categorie'))
    await setDoc(ref, { id: ref.id, nome, reparto: repartoAttivo, ordine: categorie.length, attiva: true })
    toast.success('Categoria creata!')
    await caricaDatiRistorante(ristoranteAttivo)
  }

  // ── TAVOLI ───────────────────────────────────────────────────────────────────
  const creaTavoliInBulk = async () => {
    if (!ristoranteAttivo) return
    const da = prompt('Da quale numero?', '1')
    const a  = prompt('A quale numero?', '10')
    if (!da || !a) return
    const numDa = parseInt(da), numA = parseInt(a)
    if (isNaN(numDa) || isNaN(numA) || numDa > numA) { toast.error('Numeri non validi'); return }
    for (let i = numDa; i <= numA; i++) {
      if (!tavoli.find(t => t.numero === i))
        await creaTavolo(ristoranteAttivo.id, { numero: i, nome: `Tavolo ${i}`, posti: 4, stato: 'libero' })
    }
    toast.success(`Tavoli ${numDa}-${numA} creati!`)
    await caricaDatiRistorante(ristoranteAttivo)
  }

  const eliminaTavolo = async (t: Tavolo) => {
    if (!ristoranteAttivo || !confirm(`Eliminare ${t.nome}?`)) return
    await deleteDoc(doc(db, 'ristoranti', ristoranteAttivo.id, 'tavoli', t.id))
    toast.success('Tavolo eliminato')
    await caricaDatiRistorante(ristoranteAttivo)
  }

  const REPARTI = [
    { id: 'antipasti', label: 'Antipasti' }, { id: 'cucina', label: 'Cucina' },
    { id: 'pizzeria', label: 'Pizzeria' },   { id: 'bar', label: 'Bar' },
    { id: 'pasticceria', label: 'Pasticceria' }
  ]

  if (loading || loadingDati) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── VISTA GESTISCI RISTORANTE ────────────────────────────────────────────────
  if (vista === 'gestisci' && ristoranteAttivo) {
    const piattiReparto = piatti.filter(p => p.reparto === repartoAttivo)
    const categorieReparto = categorie.filter(c => c.reparto === repartoAttivo)

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
            <div className="flex gap-1">
              {([
                { id: 'info',   label: 'Info & Grafica', emoji: '⚙️' },
                { id: 'menu',   label: 'Menu',           emoji: '📋' },
                { id: 'tavoli', label: 'Tavoli',         emoji: '🪑' },
              ] as const).map(v => (
                <button key={v.id} onClick={() => setSezione(v.id)}
                  className={`px-5 py-4 text-sm font-medium border-b-2 transition-colors ${
                    sezione === v.id ? 'border-red-500 text-red-500' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {v.emoji} {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* SEZIONE INFO */}
          {sezione === 'info' && (
            <div className="max-w-2xl">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
                <h3 className="font-semibold text-gray-800 mb-5">Informazioni ristorante</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input value={ristoranteAttivo.nome}
                      onChange={e => setRistoranteAttivo({ ...ristoranteAttivo, nome: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Colori brand</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['primario', 'secondario', 'sfondo', 'testo'] as const).map(c => (
                        <div key={c} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                          <input type="color" value={ristoranteAttivo.colori[c]}
                            onChange={e => setRistoranteAttivo({ ...ristoranteAttivo, colori: { ...ristoranteAttivo.colori, [c]: e.target.value }})}
                            className="w-8 h-8 rounded cursor-pointer border-0"/>
                          <span className="text-xs text-gray-500 capitalize">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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

          {/* SEZIONE MENU */}
          {sezione === 'menu' && (
            <div>
              <div className="flex gap-2 mb-6 flex-wrap">
                {REPARTI.map(r => (
                  <button key={r.id} onClick={() => setRepartoAttivo(r.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      repartoAttivo === r.id ? 'bg-red-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
                    }`}>{r.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700 text-sm">Categorie</h3>
                    <button onClick={creaCategoria} className="text-red-500 text-lg font-bold">+</button>
                  </div>
                  {categorieReparto.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-4">Nessuna categoria</p>
                    : categorieReparto.map(c => (
                      <div key={c.id} className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 mb-1">
                        {c.nome} <span className="text-gray-400">({piattiReparto.filter(p => p.categoriaId === c.id).length})</span>
                      </div>
                    ))
                  }
                </div>
                <div className="lg:col-span-3">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-700">{REPARTI.find(r => r.id === repartoAttivo)?.label}
                      <span className="text-gray-400 font-normal text-sm ml-2">({piattiReparto.length})</span>
                    </h3>
                    <button onClick={apriNuovoPiatto}
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
                      + Aggiungi piatto
                    </button>
                  </div>
                  {piattiReparto.length === 0
                    ? <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                        <p className="text-gray-500 mb-4">Nessun piatto in questo reparto</p>
                        <button onClick={apriNuovoPiatto} className="bg-red-500 text-white px-5 py-2 rounded-xl text-sm">Aggiungi piatto</button>
                      </div>
                    : <div className="flex flex-col gap-3">
                        {piattiReparto.map(p => (
                          <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800">{p.nome}</span>
                                {!p.disponibile && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Non disponibile</span>}
                              </div>
                              {p.descrizione && <p className="text-sm text-gray-500 mt-0.5">{p.descrizione}</p>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-gray-800">€ {p.prezzo.toFixed(2)}</span>
                              <button onClick={() => apriModificaPiatto(p)} className="text-xs text-blue-500 border border-blue-100 px-3 py-1 rounded-lg">Modifica</button>
                              <button onClick={() => eliminaPiatto(p)} className="text-xs text-red-400 hover:text-red-500">🗑</button>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              </div>

              {/* Modale piatto */}
              {modalePiatto && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                    <h3 className="font-bold text-gray-800 mb-5">{piattoEdit ? 'Modifica piatto' : 'Nuovo piatto'}</h3>
                    <form onSubmit={salvaPiatto} className="flex flex-col gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                        <input value={formPiatto.nome} onChange={e => setFormPiatto(f => ({ ...f, nome: e.target.value }))}
                          placeholder="es. Spaghetti alla carbonara" required
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                        <textarea value={formPiatto.descrizione} onChange={e => setFormPiatto(f => ({ ...f, descrizione: e.target.value }))}
                          rows={2} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"/>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prezzo (€) *</label>
                        <input type="number" step="0.50" min="0" value={formPiatto.prezzo}
                          onChange={e => setFormPiatto(f => ({ ...f, prezzo: e.target.value }))}
                          placeholder="12.50" required
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"/>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                        <select value={formPiatto.categoriaId} onChange={e => setFormPiatto(f => ({ ...f, categoriaId: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                          <option value="">Nessuna categoria</option>
                          {categorieReparto.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="disp" checked={formPiatto.disponibile}
                          onChange={e => setFormPiatto(f => ({ ...f, disponibile: e.target.checked }))}
                          className="w-4 h-4 accent-red-500"/>
                        <label htmlFor="disp" className="text-sm text-gray-700">Disponibile</label>
                      </div>
                      <div className="flex gap-3 mt-2">
                        <button type="button" onClick={() => setModalePiatto(false)}
                          className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600">Annulla</button>
                        <button type="submit"
                          className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold">
                          {piattoEdit ? 'Salva modifiche' : 'Aggiungi piatto'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SEZIONE TAVOLI */}
          {sezione === 'tavoli' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-gray-700">Tavoli ({tavoli.length})</h3>
                <button onClick={creaTavoliInBulk}
                  className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium">
                  ⚡ Crea in blocco
                </button>
              </div>
              {tavoli.length === 0
                ? <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                    <p className="text-gray-500 mb-4">Nessun tavolo</p>
                    <button onClick={creaTavoliInBulk} className="bg-red-500 text-white px-6 py-3 rounded-xl">Crea tavoli</button>
                  </div>
                : <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3">
                    {tavoli.map(t => (
                      <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                        <p className="font-bold text-gray-800">{t.numero}</p>
                        <p className="text-xs text-gray-400">{t.posti} posti</p>
                        <button onClick={() => eliminaTavolo(t)} className="text-xs text-red-400 mt-1">🗑</button>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}
        </div>
      </div>
    )
  }

  // Helper per evitare errore scope
  const piattiReparto = piatti.filter(p => p.reparto === repartoAttivo)

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
