import type { Firestore } from 'firebase-admin/firestore'
import type { BillingRistorante } from '@/types'

const CAMPI_BILLING = ['piano', 'statoAbbonamento', 'stripeCustomerId', 'stripeSubscriptionId'] as const

// Legge la fatturazione da ristoranti/{id}/config/billing. Finché la
// migrazione (scripts/migra-billing.mjs) non è stata eseguita, i dati possono
// stare ancora sul documento ristorante: in quel caso si usano quelli, e i
// valori di config/billing hanno sempre la precedenza.
// null = nessun dato di fatturazione (es. ristorante creato a mano dall'admin).
export async function leggiBilling(adminDb: Firestore, restaurantId: string): Promise<Partial<BillingRistorante> | null> {
  const ristoranteRef = adminDb.collection('ristoranti').doc(restaurantId)
  const [ristoranteSnap, billingSnap] = await Promise.all([
    ristoranteRef.get(),
    ristoranteRef.collection('config').doc('billing').get(),
  ])
  const ristorante = ristoranteSnap.data() || {}
  const vecchiCampi = Object.fromEntries(
    CAMPI_BILLING.filter(c => ristorante[c] !== undefined).map(c => [c, ristorante[c]])
  )
  const billing = { ...vecchiCampi, ...billingSnap.data() }
  return Object.keys(billing).length > 0 ? billing : null
}
