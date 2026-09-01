'use client'
import { useState, useEffect } from 'react'
import { getCategorie, getPiatti, creaPiatto, aggiornaPiatto } from '@/lib/firestore'
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante, Categoria, Piatto, CategoriaReparto } from '@/types'
import toast from 'react-hot-toast'

const REPARTI: { id: CategoriaReparto; label: string; emoji: string }[] = [
  { id: 'antipasti', label: 'Antipasti',  emoji: '🥗' },
  { id: 'cucina',    label: 'Cucina',     emoji: '🍝' },
  { id: 'pizzeria',  label: 'Pizzeria',   emoji: '🍕' },
  { id: 'bar',       label: 'Bar',        emoji: '🍷' },
  { id: 'pasticceria', label: 'Pasticceria', emoji: '🍰' },
]

export default function MenuManager({ ristorante }: { ristorante: Ristorante }) {
  const [categorie, setCategorie] = useState<Categoria[]>([])
  const [piatti, setPiatti]       = useState<Piatto[]>([])
  const [repartoAttivo, setRepartoAttivo] = useState<CategoriaReparto>('cucina')
  const [modalePiatto, setModalePiatto]   = useState(false)
  const [piattoEdit, setPiattoEdit]       = useState<Piatto | null>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    nome: '', descrizione: '', prezzo: '', categoriaId: '', disponibile: true
  })

  useEffect(() => { caricaDati() }, [ristorante.id])

  const caricaDati = async () => {
    const [cats, platti] = await Promise.all([
      getCategorie(ristorante.id),
      getPiatti(ristorante.id)
    ])
    setCategorie(cats)
    setPiatti(platti)
    setLoading(false)
  }

  const categorieReparto = categorie.filter(c => c.reparto === repartoAttivo)
  const piattiReparto    = piatti.filter(p => p.reparto === repartoAttivo)

  const apriNuovoPiatto = () => {
    setPiattoEdit(null)
    setForm({ nome: '', descrizione: '', prezzo: '', categoriaId: categorieReparto[0]?.id || '', disponibile: true })
    setModalePiatto(true)
  }

  const apriModificaPiatto = (p: Piatto) => {
    setPiattoEdit(p)
    setForm({ nome: p.nome, descrizione: p.descrizione || '', prezzo: String(p.prezzo), categoriaId: p.categoriaId, disponibile: p.disponibile })
    setModalePiatto(true)
  }

  const salvaPiatto = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const dati = {
        nome: form.nome,
        descrizione: form.descrizione,
        prezzo: parseFloat(form.prezzo),
        categoriaId: form.categoriaId,
        reparto: repartoAttivo,
        disponibile: form.disponibile,
      }
      if (piattoEdit) {
        // Non tocca "ordine": altrimenti ogni modifica sposterebbe il piatto in fondo alla lista
        await aggiornaPiatto(ristorante.id, piattoEdit.id, dati)
        toast.success('Piatto aggiornato!')
      } else {
        await creaPiatto(ristorante.id, { ...dati, ordine: piatti.length })
        toast.success('Piatto aggiunto!')
      }
      setModalePiatto(false)
      caricaDati()
    } catch {
      toast.error('Errore nel salvataggio')
    }
  }

  const toggleDisponibile = async (p: Piatto) => {
    await aggiornaPiatto(ristorante.id, p.id, { disponibile: !p.disponibile })
    caricaDati()
  }

  const eliminaPiatto = async (p: Piatto) => {
    if (!confirm(`Eliminare "${p.nome}"?`)) return
    await deleteDoc(doc(db, 'ristoranti', ristorante.id, 'piatti', p.id))
    toast.success('Piatto eliminato')
    caricaDati()
  }

  const creaCategoria = async () => {
    const nome = prompt('Nome categoria (es. Primi piatti):')
    if (!nome) return
    const ref = doc(collection(db, 'ristoranti', ristorante.id, 'categorie'))
    await setDoc(ref, {
      id: ref.id, nome, reparto: repartoAttivo,
      ordine: categorie.length, attiva: true
    })
    toast.success('Categoria creata!')
    caricaDati()
  }

  const rinominaCategoria = async (c: Categoria) => {
    const nome = prompt('Nuovo nome categoria:', c.nome)
    if (!nome || nome === c.nome) return
    await updateDoc(doc(db, 'ristoranti', ristorante.id, 'categorie', c.id), { nome })
    toast.success('Categoria rinominata!')
    caricaDati()
  }

  const toggleAttivaCategoria = async (c: Categoria) => {
    await updateDoc(doc(db, 'ristoranti', ristorante.id, 'categorie', c.id), { attiva: !c.attiva })
    toast.success(c.attiva ? 'Categoria nascosta dal menu clienti' : 'Categoria visibile nel menu clienti')
    caricaDati()
  }

  const eliminaCategoria = async (c: Categoria) => {
    const numPiatti = piatti.filter(p => p.categoriaId === c.id).length
    if (numPiatti > 0) {
      toast.error(`Sposta o elimina prima i ${numPiatti} piatti in "${c.nome}"`)
      return
    }
    if (!confirm(`Eliminare la categoria "${c.nome}"?`)) return
    await deleteDoc(doc(db, 'ristoranti', ristorante.id, 'categorie', c.id))
    toast.success('Categoria eliminata')
    caricaDati()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div>
      {/* Selezione reparto */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {REPARTI.map(r => (
          <button
            key={r.id}
            onClick={() => setRepartoAttivo(r.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              repartoAttivo === r.id
                ? 'bg-red-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {r.emoji} {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Categorie */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700 text-sm">Categorie</h3>
              <button onClick={creaCategoria} className="text-red-500 hover:text-red-600 text-lg font-bold">+</button>
            </div>
            {categorieReparto.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nessuna categoria</p>
            ) : (
              <div className="flex flex-col gap-1">
                {categorieReparto.map(c => (
                  <div key={c.id} className={`px-3 py-2 rounded-lg text-sm group ${c.attiva ? 'bg-gray-50 text-gray-700' : 'bg-gray-50 text-gray-400'}`}>
                    <div className="flex items-center justify-between">
                      <span className={!c.attiva ? 'line-through' : ''}>
                        {c.nome}
                        <span className="text-xs text-gray-400 ml-2">
                          ({piattiReparto.filter(p => p.categoriaId === c.id).length})
                        </span>
                      </span>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => rinominaCategoria(c)} title="Rinomina" className="text-gray-400 hover:text-blue-500 text-xs">✎</button>
                        <button onClick={() => toggleAttivaCategoria(c)} title={c.attiva ? 'Nascondi dal menu' : 'Mostra nel menu'} className="text-gray-400 hover:text-yellow-500 text-xs">
                          {c.attiva ? '👁' : '🙈'}
                        </button>
                        <button onClick={() => eliminaCategoria(c)} title="Elimina" className="text-gray-400 hover:text-red-500 text-xs">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Piatti */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700">
              {REPARTI.find(r => r.id === repartoAttivo)?.emoji} {REPARTI.find(r => r.id === repartoAttivo)?.label}
              <span className="text-gray-400 font-normal text-sm ml-2">({piattiReparto.length} piatti)</span>
            </h3>
            <button
              onClick={apriNuovoPiatto}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              + Aggiungi piatto
            </button>
          </div>

          {piattiReparto.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="text-gray-500 mb-4">Nessun piatto in questo reparto</p>
              <button onClick={apriNuovoPiatto} className="bg-red-500 text-white px-5 py-2 rounded-xl text-sm font-medium">
                Aggiungi il primo piatto
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {piattiReparto.map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">{p.nome}</span>
                        {!p.disponibile && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Non disponibile</span>
                        )}
                      </div>
                      {p.descrizione && <p className="text-sm text-gray-500 mt-0.5">{p.descrizione}</p>}
                      <p className="text-sm text-gray-400 mt-0.5">
                        {categorie.find(c => c.id === p.categoriaId)?.nome || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">€ {p.prezzo.toFixed(2)}</span>
                    <button
                      onClick={() => toggleDisponibile(p)}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                        p.disponibile
                          ? 'border-green-200 text-green-600 hover:bg-green-50'
                          : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {p.disponibile ? '✓ Disponibile' : '✗ Off'}
                    </button>
                    <button onClick={() => apriModificaPiatto(p)} className="text-xs text-blue-500 hover:text-blue-600 border border-blue-100 px-3 py-1 rounded-lg">
                      Modifica
                    </button>
                    <button onClick={() => eliminaPiatto(p)} className="text-xs text-red-400 hover:text-red-500">
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modale piatto */}
      {modalePiatto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-800 mb-5">
              {piattoEdit ? 'Modifica piatto' : 'Nuovo piatto'}
            </h3>
            <form onSubmit={salvaPiatto} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="es. Spaghetti alla carbonara"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                <textarea
                  value={form.descrizione}
                  onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
                  placeholder="Ingredienti o descrizione breve"
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prezzo (€) *</label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={form.prezzo}
                  onChange={e => setForm(f => ({ ...f, prezzo: e.target.value }))}
                  placeholder="12.50"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={form.categoriaId}
                  onChange={e => setForm(f => ({ ...f, categoriaId: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                >
                  <option value="">Nessuna categoria</option>
                  {categorieReparto.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="disponibile"
                  checked={form.disponibile}
                  onChange={e => setForm(f => ({ ...f, disponibile: e.target.checked }))}
                  className="w-4 h-4 accent-red-500"
                />
                <label htmlFor="disponibile" className="text-sm text-gray-700">Disponibile</label>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setModalePiatto(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold"
                >
                  {piattoEdit ? 'Salva modifiche' : 'Aggiungi piatto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
