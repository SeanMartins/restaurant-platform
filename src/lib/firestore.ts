import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, Timestamp,
  addDoc
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

export async function getRistoranteBySlug(slug: string): Promise<Ristorante | null> {
  const q = query(paths.ristoranti(), where('slug', '==', slug))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return snap.docs[0].data() as Ristorante
}

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
export async function creaOrdine(restaurantId: string, ordine: Omit<Ordine, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = doc(paths.ordini(restaurantId))
  const nuovoOrdine: Ordine = {
    ...ordine,
    id: ref.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await setDoc(ref, nuovoOrdine)
  // Aggiorna stato tavolo
  await aggiornaTavolo(restaurantId, ordine.tavoloId, { stato: 'occupato' })
  return nuovoOrdine
}

// Listener realtime ordini per reparto
export function ascoltaOrdiniReparto(
  restaurantId: string,
  reparto: string,
  callback: (ordini: Ordine[]) => void
) {
  const q = query(
    paths.ordini(restaurantId),
    orderBy('createdAt')
  )
  return onSnapshot(q, (snap) => {
    const tutti = snap.docs.map(d => d.data() as Ordine)
    const filtrati = tutti
      .filter(o => o.stato !== 'servito')
      .map(o => ({
        ...o,
        righe: o.righe.filter(r => r.reparto === reparto && r.stato !== 'servito')
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

// Aggiorna stato di una riga ordine (un piatto è pronto)
export async function aggiornaStatoRiga(
  restaurantId: string,
  ordineId: string,
  piattoIndex: number,
  nuovoStato: RigaOrdine['stato']
) {
  const ordineRef = doc(paths.ordini(restaurantId), ordineId)
  const snap = await getDoc(ordineRef)
  if (!snap.exists()) return
  const ordine = snap.data() as Ordine
  ordine.righe[piattoIndex].stato = nuovoStato
  // Controlla se tutte le righe sono pronte
  const tuttePronte = ordine.righe.every(r => r.stato === 'pronto' || r.stato === 'servito')
  await updateDoc(ordineRef, {
    righe: ordine.righe,
    stato: tuttePronte ? 'pronto' : ordine.stato,
    updatedAt: new Date().toISOString()
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
