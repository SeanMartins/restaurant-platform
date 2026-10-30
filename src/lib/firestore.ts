import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, Timestamp,
  addDoc, runTransaction
} from 'firebase/firestore'
import { db } from './firebase'
import type { Ristorante, Categoria, Piatto, Tavolo, Ordine, RigaOrdine, AppUser } from '@/types'

// ─── PATHS HELPER ───────────────────────────────────────────────────────────
const paths = {
  ristoranti:          () => collection(db, 'ristoranti'),
  ristorante:          (rid: string) => doc(db, 'ristoranti', rid),
  categorie:           (rid: string) => collection(db, 'ristoranti', rid, 'categorie'),
  piatti:              (rid: string) => collection(db, 'ristoranti', rid, 'piatti'),
  tavoli:              (rid: string) => collection(db, 'ristoranti', rid, 'tavoli'),
  ordini:              (rid: string) => collection(db, 'ristoranti', rid, 'ordini'),
  utenti:              (rid: string) => collection(db, 'ristoranti', rid, 'utenti'),
  utentiGlobali:       () => collection(db, 'utenti'),
}

// ─── RISTORANTI ─────────────────────────────────────────────────────────────
export async function creaRistorante(dati: Omit<Ristorante, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = doc(paths.ristoranti())
  const ristorante: Ristorante = {
    ...dati,
    id: ref.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await setDoc(ref, ristorante)
  return ristorante
}

export async function getRistorante(id: string): Promise<Ristorante | null> {
  const snap = await getDoc(paths.ristorante(id))
  return snap.exists() ? (snap.data() as Ristorante) : null
}

// Query sulla collezione: le regole la permettono solo al superadmin. Il menu
// pubblico usa getRistorantePubblicoBySlug (lato server).
export async function getRistoranteBySlug(slug: string): Promise<Ristorante | null> {
  const q = query(paths.ristoranti(), where('slug', '==', slug))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return snap.docs[0].data() as Ristorante
}

// Solo superadmin (list sulla collezione)
export async function getTuttiRistoranti(): Promise<Ristorante[]> {
  const snap = await getDocs(paths.ristoranti())
  return snap.docs.map(d => d.data() as Ristorante)
}

export async function aggiornaRistorante(id: string, dati: Partial<Ristorante>) {
  await updateDoc(paths.ristorante(id), { ...dati, updatedAt: new Date().toISOString() })
}

// ─── MENU ───────────────────────────────────────────────────────────────────
export async function getCategorie(restaurantId: string): Promise<Categoria[]> {
  const q = query(paths.categorie(restaurantId), orderBy('ordine'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as Categoria)
}

export async function getPiatti(restaurantId: string): Promise<Piatto[]> {
  const q = query(paths.piatti(restaurantId), orderBy('ordine'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as Piatto)
}

export async function creaPiatto(restaurantId: string, piatto: Omit<Piatto, 'id'>) {
  const ref = doc(paths.piatti(restaurantId))
  await setDoc(ref, { ...piatto, id: ref.id })
  return { ...piatto, id: ref.id }
}

export async function aggiornaPiatto(restaurantId: string, piattoId: string, dati: Partial<Piatto>) {
  await updateDoc(doc(paths.piatti(restaurantId), piattoId), dati)
}

// ─── TAVOLI ─────────────────────────────────────────────────────────────────
export async function getTavoli(restaurantId: string): Promise<Tavolo[]> {
  const q = query(paths.tavoli(restaurantId), orderBy('numero'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as Tavolo)
}

export async function creaTavolo(restaurantId: string, tavolo: Omit<Tavolo, 'id'>) {
  const ref = doc(paths.tavoli(restaurantId))
  await setDoc(ref, { ...tavolo, id: ref.id })
  return { ...tavolo, id: ref.id }
}

export async function aggiornaTavolo(restaurantId: string, tavoloId: string, dati: Partial<Tavolo>) {
  await updateDoc(doc(paths.tavoli(restaurantId), tavoloId), dati)
}

// ─── ORDINI ─────────────────────────────────────────────────────────────────
// La creazione degli ordini passa da /api/ordini (le regole vietano la
// scrittura dal client).

// Ordini del cliente (non serviti) letti per ID — usato dal menu cliente per
// recuperare lo stato degli ordini dopo un redirect di pagamento (Stripe/PayPal).
// Le regole permettono al pubblico solo la lettura per ID, non le query.
export async function getOrdiniPerId(restaurantId: string, ordineIds: string[]): Promise<Ordine[]> {
  const snaps = await Promise.all(ordineIds.map(id => getDoc(doc(paths.ordini(restaurantId), id))))
  return snaps
    .filter(s => s.exists())
    .map(s => s.data() as Ordine)
    .filter(o => o.stato !== 'servito')
}

// Ordine visto da un reparto: solo le sue righe, ognuna con la posizione
// nell'array completo `righe` (quella che serve ad aggiornaStatoRiga)
export type RigaReparto = RigaOrdine & { indice: number }
export type OrdineReparto = Omit<Ordine, 'righe'> & { righe: RigaReparto[] }

// Listener realtime ordini per reparto
export function ascoltaOrdiniReparto(
  restaurantId: string,
  reparto: string,
  callback: (ordini: OrdineReparto[]) => void
) {
  const q = query(
    paths.ordini(restaurantId),
    orderBy('createdAt')
  )
  return onSnapshot(q, (snap) => {
    const tutti = snap.docs.map(d => d.data() as Ordine)
    const filtrati = tutti
      .filter(o => o.stato !== 'servito' && o.stato !== 'in_attesa_pagamento')
      .map(o => ({
        ...o,
        righe: o.righe
          .map((r, indice) => ({ ...r, indice }))
          .filter(r => r.reparto === reparto && r.stato !== 'servito')
      }))
      .filter(o => o.righe.length > 0)
    callback(filtrati)
  })
}
// Listener realtime tutti gli ordini per la cassa
export function ascoltaOrdiniCassa(
  restaurantId: string,
  callback: (ordini: Ordine[]) => void
) {
  const q = query(
    paths.ordini(restaurantId),
    where('stato', 'in', ['ricevuto', 'in_preparazione', 'pronto']),
    orderBy('createdAt')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => d.data() as Ordine))
  })
}

// Aggiorna stato di una riga ordine (un piatto è pronto).
// Usa una transazione per evitare la race condition tra lettura e scrittura
// dell'array `righe`: due reparti che aggiornano righe diverse dello stesso
// ordine quasi in contemporanea potrebbero altrimenti sovrascriversi a vicenda
// (leggono entrambi lo stesso array, ognuno scrive la propria versione modificata
// perdendo la modifica dell'altro).
export async function aggiornaStatoRiga(
  restaurantId: string,
  ordineId: string,
  piattoIndex: number,
  nuovoStato: RigaOrdine['stato']
) {
  const ordineRef = doc(paths.ordini(restaurantId), ordineId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ordineRef)
    if (!snap.exists()) return
    const ordine = snap.data() as Ordine
    if (!ordine.righe[piattoIndex]) return
    const righe = [...ordine.righe]
    righe[piattoIndex] = { ...righe[piattoIndex], stato: nuovoStato }
    // Controlla se tutte le righe sono pronte
    const tuttePronte = righe.every(r => r.stato === 'pronto' || r.stato === 'servito')
    tx.update(ordineRef, {
      righe,
      stato: tuttePronte ? 'pronto' : ordine.stato,
      updatedAt: new Date().toISOString()
    })
  })
}

// ─── UTENTI ─────────────────────────────────────────────────────────────────
export async function salvaUtente(utente: AppUser) {
  await setDoc(doc(db, 'utenti', utente.uid), utente)
}

export async function getUtente(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'utenti', uid))
  return snap.exists() ? (snap.data() as AppUser) : null
}
