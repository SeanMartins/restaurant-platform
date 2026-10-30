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
  onboardingCompletato?: boolean
  createdAt: string
  updatedAt: string
}

// Il documento del ristorante è leggibile pubblicamente (menu e QR): i dati
// di fatturazione vivono in ristoranti/{id}/config/billing, leggibile solo da
// manager e superadmin e scritto solo dal server.
export interface BillingRistorante {
  piano: 'base' | 'pro'
  statoAbbonamento: 'attivo' | 'scaduto' | 'cancellato'
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  scadenza?: string | null   // YYYY-MM-DD, impostata a mano dal superadmin (es. piloti gratuiti)
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
export type StatoOrdine = 'in_attesa_pagamento' | 'ricevuto' | 'in_preparazione' | 'pronto' | 'servito'

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
  metodoPagamento?: 'cassa' | 'stripe' | 'paypal' | 'satispay'
  // Pagamento online: scritti solo dal server al checkout e verificati dal
  // webhook Stripe / dalla cattura PayPal prima di segnare l'ordine pagato
  importoAtteso?: number
  stripeSessionId?: string
  paypalOrderId?: string
  riferimentoPagamento?: string   // payment intent Stripe o capture PayPal
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
