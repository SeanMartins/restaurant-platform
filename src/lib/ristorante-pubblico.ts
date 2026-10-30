import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from './firebase-admin'
import type { Ristorante } from '@/types'

// Solo i campi da vetrina che servono al menu cliente
export type RistorantePubblico = Pick<Ristorante, 'id' | 'nome' | 'slug' | 'colori' | 'font' | 'logo' | 'indirizzo' | 'telefono' | 'attivo'>

// Ricerca per slug lato server: le regole Firestore non permettono più al
// pubblico di fare query (list) sulla collezione ristoranti.
export async function getRistorantePubblicoBySlug(slug: string): Promise<RistorantePubblico | null> {
  const snap = await getFirestore(getAdminApp())
    .collection('ristoranti').where('slug', '==', slug).limit(1).get()
  if (snap.empty) return null
  const r = snap.docs[0].data() as Ristorante
  return {
    id: r.id, nome: r.nome, slug: r.slug, colori: r.colori, font: r.font,
    logo: r.logo, indirizzo: r.indirizzo, telefono: r.telefono, attivo: r.attivo,
  }
}
