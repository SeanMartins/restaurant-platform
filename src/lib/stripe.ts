import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY mancante')
  stripeClient = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' })
  return stripeClient
}

// Client Stripe per un ristorante specifico (paga con le SUE chiavi, non quelle della piattaforma)
export function getStripeForRestaurant(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' })
}

export const PIANI = {
  base: { nome: 'Base', priceId: process.env.STRIPE_PRICE_BASE },
  pro:  { nome: 'Pro',  priceId: process.env.STRIPE_PRICE_PRO },
} as const

export type PianoId = keyof typeof PIANI
