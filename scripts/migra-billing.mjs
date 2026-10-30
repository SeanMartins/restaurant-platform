// Migrazione: sposta i dati di fatturazione dal documento ristorante (leggibile
// pubblicamente) a ristoranti/{id}/config/billing, e crea l'indice
// abbonamenti/{subscriptionId} usato dal webhook Stripe per l'idempotenza.
//
// Uso (dalla cartella del progetto):
//   node --env-file=.env.local scripts/migra-billing.mjs            → simulazione, non scrive nulla
//   node --env-file=.env.local scripts/migra-billing.mjs --esegui   → applica la migrazione
//
// Idempotente: si può rilanciare. Un ristorante senza campi di fatturazione
// sul documento viene saltato. Va eseguita DOPO il deploy della nuova app e
// PRIMA delle nuove regole Firestore (che rifiutano i documenti ristorante
// che contengono ancora questi campi).

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const CAMPI_BILLING = ['piano', 'statoAbbonamento', 'stripeCustomerId', 'stripeSubscriptionId']
const esegui = process.argv.includes('--esegui')

const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env
if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) {
  console.error('Firebase Admin env vars mancanti (usa --env-file=.env.local)')
  process.exit(1)
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
})
const db = getFirestore()

console.log(`Progetto: ${FIREBASE_ADMIN_PROJECT_ID} — modalità: ${esegui ? 'ESECUZIONE' : 'simulazione (aggiungi --esegui per scrivere)'}\n`)

const ristoranti = await db.collection('ristoranti').get()
let daMigrare = 0

for (const snap of ristoranti.docs) {
  const dati = snap.data()
  const presenti = CAMPI_BILLING.filter(c => dati[c] !== undefined)
  if (presenti.length === 0) {
    console.log(`- ${dati.nome} (${snap.id}): niente da migrare`)
    continue
  }
  daMigrare++

  const billingRef = snap.ref.collection('config').doc('billing')
  const billingEsistente = (await billingRef.get()).data() || {}
  // Un valore già presente in config/billing (scritto dal nuovo webhook) vince
  // su quello vecchio del documento ristorante.
  const billing = {
    piano: dati.piano ?? 'base',
    statoAbbonamento: dati.statoAbbonamento ?? 'attivo',
    ...(dati.stripeCustomerId ? { stripeCustomerId: dati.stripeCustomerId } : {}),
    ...(dati.stripeSubscriptionId ? { stripeSubscriptionId: dati.stripeSubscriptionId } : {}),
    ...billingEsistente,
    updatedAt: new Date().toISOString(),
  }

  console.log(`- ${dati.nome} (${snap.id}): sposto ${presenti.join(', ')} → config/billing`, billing)
  if (!esegui) continue

  const batch = db.batch()
  batch.set(billingRef, billing)
  if (billing.stripeSubscriptionId) {
    batch.set(db.collection('abbonamenti').doc(billing.stripeSubscriptionId),
      { restaurantId: snap.id, createdAt: dati.createdAt ?? new Date().toISOString() }, { merge: true })
  }
  batch.update(snap.ref, Object.fromEntries(presenti.map(c => [c, FieldValue.delete()])))
  await batch.commit()
}

console.log(`\nRistoranti totali: ${ristoranti.size}, da migrare: ${daMigrare}${esegui ? ' (migrati)' : ' (nessuna scrittura eseguita)'}`)
