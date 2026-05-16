// ─── UTENTI ────────────────────────────────────────────────────────────────
export type UserRole = 'superadmin' | 'manager' | 'cucina' | 'pizzeria' | 'bar' | 'pasticceria' | 'antipasti' | 'cassa'

export interface AppUser {
  uid: string
  email: string
  role: UserRole
  restaurantId?: string   // null per superadmin
  displayName?: string
  createdAt: string
}

// ─── RISTORANTE ─────────────────────────────────────────────────────────────
export interface Ristorante {
  id: string
  nome: string
  slug: string            // URL univoco: piattaforma.com/da-mario
  indirizzo?: string
  telefono?: string
  logo?: string
  colori: {
    primario: string      // es. #E63946
    secondario: string
    sfondo: string
    testo: string
  }
  font?: string
  attivo: boolean
  createdAt: string
  updatedAt: string
}

// ─── MENU ───────────────────────────────────────────────────────────────────
export type CategoriaReparto = 'cucina' | 'pizzeria' | 'bar' | 'pasticceria' | 'antipasti'

export interface Categoria {
  id: string
  nome: string            // es. "Primi piatti"
  reparto: CategoriaReparto
  ordine: number          // per l'ordinamento nel menu
  attiva: boolean
}

export interface Piatto {
  id: string
  nome: string
  descrizione?: string
  prezzo: number
  categoriaId: string
  reparto: CategoriaReparto
  immagine?: string
  allergeni?: string[]
  disponibile: boolean
  ordine: number
}

// ─── TAVOLI ─────────────────────────────────────────────────────────────────
export interface Tavolo {
  id: string
  numero: number
  nome?: string           // es. "Tavolo terrazza 1"
  posti: number
  qrCodeUrl?: string
  stato: 'libero' | 'occupato' | 'pagamento'
}

// ─── ORDINI ─────────────────────────────────────────────────────────────────
export type StatoOrdine = 'ricevuto' | 'in_preparazione' | 'pronto' | 'servito'

export interface RigaOrdine {
  piattoId: string
  nome: string
  prezzo: number
  quantita: number
  reparto: CategoriaReparto
  note?: string
  stato: StatoOrdine
}

export interface Ordine {
  id: string
  tavoloId: string
  tavoloNumero: number
  righe: RigaOrdine[]
  totale: number
  stato: StatoOrdine
  createdAt: string
  updatedAt: string
}

// ─── CONTO TAVOLO ───────────────────────────────────────────────────────────
export interface ContoTavolo {
  tavoloId: string
  tavoloNumero: number
  ordini: Ordine[]
  totaleComplessivo: number
  aperto: boolean
  inizioServizio: string
}
