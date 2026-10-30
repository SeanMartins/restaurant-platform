import type { Firestore } from 'firebase-admin/firestore'

// Errore esplicito da restituire al client (400) quando il totale non può
// essere ricalcolato in modo affidabile: es. un piatto referenziato è stato
// rimosso dal menu, o i dati della riga sono incoerenti.
export class OrdineTotaleError extends Error {}

interface RigaOrdineMinima {
  piattoId: string
  quantita: number
}

/**
 * Ricalcola il totale reale di un ordine leggendo i prezzi attuali dei piatti
 * dal menu (collezione `piatti`), invece di fidarsi del `totale` (o del
 * `prezzo` di riga) scritto dal client. Il client scrive l'ordine senza auth
 * (kiosk), quindi qualunque campo prezzo/totale sull'ordine può essere stato
 * alterato: qui viene ricostruito da zero usando solo `piattoId` e `quantita`.
 *
 * Lancia OrdineTotaleError se un piatto non esiste più o se una riga non è
 * valida: il chiamante deve rifiutare esplicitamente il checkout in tal caso,
 * mai ignorare l'errore.
 */
export async function ricalcolaTotaleOrdine(
  adminDb: Firestore,
  restaurantId: string,
  ordine: { righe: RigaOrdineMinima[] }
): Promise<number> {
  const righe = ordine.righe
  if (!Array.isArray(righe) || righe.length === 0) {
    throw new OrdineTotaleError('Ordine senza righe valide')
  }

  const piattoIds = Array.from(new Set(righe.map(r => r.piattoId)))
  const piattiSnaps = await Promise.all(
    piattoIds.map(id =>
      adminDb.collection('ristoranti').doc(restaurantId).collection('piatti').doc(id).get()
    )
  )

  const prezziAttuali = new Map<string, number>()
  for (const snap of piattiSnaps) {
    if (!snap.exists) {
      throw new OrdineTotaleError(`Il piatto "${snap.id}" non esiste più nel menu`)
    }
    const prezzo = snap.data()?.prezzo
    if (typeof prezzo !== 'number' || !Number.isFinite(prezzo) || prezzo < 0) {
      throw new OrdineTotaleError(`Prezzo non valido per il piatto "${snap.id}"`)
    }
    prezziAttuali.set(snap.id, prezzo)
  }

  let totale = 0
  for (const riga of righe) {
    const prezzo = prezziAttuali.get(riga.piattoId)
    if (prezzo === undefined) {
      throw new OrdineTotaleError(`Il piatto "${riga.piattoId}" non esiste più nel menu`)
    }
    if (typeof riga.quantita !== 'number' || !Number.isFinite(riga.quantita) || riga.quantita <= 0) {
      throw new OrdineTotaleError(`Quantità non valida per il piatto "${riga.piattoId}"`)
    }
    totale += prezzo * riga.quantita
  }

  // Arrotonda a 2 decimali per evitare errori di floating point sui centesimi
  return Math.round(totale * 100) / 100
}
