export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getStripe, PIANI } from '@/lib/stripe'
import { inviaEmailBenvenuto } from '@/lib/resend'
import type { PianoId } from '@/lib/stripe'
import type { Ristorante, BillingRistorante, AppUser } from '@/types'

const COLORI_DEFAULT = { primario: '#E63946', secondario: '#457B9D', sfondo: '#F1FAEE', testo: '#1D3557' }

// abbonamenti/{subscriptionId} è un indice solo-server (nessuna regola client):
// { restaurantId, managerUid, daVerificare? }. Serve per l'idempotenza del
// provisioning (Stripe può consegnare lo stesso evento più volte) e per
// ritrovare il ristorante dagli eventi della subscription.

async function generaSlugUnivoco(adminDb: FirebaseFirestore.Firestore, base: string) {
  const radice = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ristorante'
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    const slug = tentativo === 0 ? radice : `${radice}-${Math.random().toString(36).slice(2, 6)}`
    const esiste = await adminDb.collection('ristoranti').where('slug', '==', slug).limit(1).get()
    if (esiste.empty) return slug
  }
  return `${radice}-${Date.now()}`
}

function pianoValido(piano: unknown): PianoId {
  if (typeof piano === 'string' && piano in PIANI) return piano as PianoId
  console.error(`Piano "${piano}" non valido nei metadata Stripe: uso "base"`)
  return 'base'
}

async function gestisciCheckoutCompletato(session: Stripe.Checkout.Session) {
  // Questo webhook gestisce solo gli abbonamenti alla piattaforma (mode: 'subscription').
  // I pagamenti dei singoli ordini ristorante (mode: 'payment') hanno il loro webhook dedicato
  // per-ristorante e non devono mai finire nel provisioning di un nuovo ristorante.
  if (session.mode !== 'subscription') {
    console.log(`Sessione Stripe con mode="${session.mode}", non è un abbonamento piattaforma: skip`)
    return
  }
  // 'no_payment_required' = periodo di prova senza addebito iniziale
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    console.log(`Sessione ${session.id} non pagata (${session.payment_status}): provisioning rimandato`)
    return
  }
  if (typeof session.subscription !== 'string') {
    console.error(`Sessione ${session.id} senza subscription: skip`)
    return
  }

  const email = session.customer_details?.email || session.customer_email
  if (!email) throw new Error('Email cliente mancante nella sessione Stripe')

  const piano = pianoValido(session.metadata?.piano)
  const subscriptionId = session.subscription
  const app = getAdminApp()
  const adminAuth = getAuth(app)
  const adminDb = getFirestore(app)
  const abbonamentoRef = adminDb.collection('abbonamenti').doc(subscriptionId)
  const nomeCliente = session.customer_details?.name || email.split('@')[0]

  // ── 1. Ristorante: creato una sola volta per subscription ──────────────
  let restaurantId: string
  const esistente = (await abbonamentoRef.get()).data()
  if (esistente?.managerUid || esistente?.daVerificare) {
    console.log(`Provisioning già eseguito per la subscription ${subscriptionId}, skip`)
    return
  }
  if (esistente) {
    // Consegna precedente interrotta dopo la creazione del ristorante: riprende da lì
    restaurantId = esistente.restaurantId
  } else {
    // L'email appartiene già a un account (es. un manager o il superadmin):
    // non si crea niente, ma si registra il caso e si risponde 200, altrimenti
    // Stripe ritenterebbe per giorni senza risultato.
    if (await adminAuth.getUserByEmail(email).catch(() => null)) {
      await abbonamentoRef.create({
        restaurantId: null, daVerificare: 'email-gia-registrata', email, createdAt: new Date().toISOString(),
      }).catch(() => {})
      console.error(`PROVISIONING DA FARE A MANO: l'email ${email} ha già un account (subscription ${subscriptionId})`)
      return
    }

    const adesso = new Date().toISOString()
    const ristoranteRef = adminDb.collection('ristoranti').doc()
    const ristorante: Ristorante = {
      id: ristoranteRef.id,
      nome: nomeCliente,
      slug: await generaSlugUnivoco(adminDb, nomeCliente),
      colori: COLORI_DEFAULT,
      attivo: true,
      onboardingCompletato: false,
      createdAt: adesso,
      updatedAt: adesso,
    }
    const billing: BillingRistorante = {
      piano,
      statoAbbonamento: 'attivo',
      stripeCustomerId: String(session.customer),
      stripeSubscriptionId: subscriptionId,
      updatedAt: adesso,
    }
    // create() fallisce se l'abbonamento esiste già: due consegne concorrenti
    // dello stesso evento non possono creare due ristoranti.
    const batch = adminDb.batch()
    batch.create(abbonamentoRef, { restaurantId: ristorante.id, managerUid: null, email, createdAt: adesso })
    batch.set(ristoranteRef, ristorante)
    batch.set(ristoranteRef.collection('config').doc('billing'), billing)
    try {
      await batch.commit()
    } catch (err: any) {
      // 6 = ALREADY_EXISTS (gRPC): l'altra consegna sta già provisionando
      if (err?.code === 6) {
        console.log(`Provisioning già in corso per la subscription ${subscriptionId}, skip`)
        return
      }
      throw err
    }
    restaurantId = ristorante.id
  }

  // ── 2. Manager del ristorante ───────────────────────────────────────────
  let userRecord = await adminAuth.getUserByEmail(email).catch(() => null)
  const nuovoUtente = !userRecord
  if (userRecord) {
    // Esiste solo se una consegna precedente l'ha già creato per questo ristorante
    const profilo = (await adminDb.collection('utenti').doc(userRecord.uid).get()).data()
    if (profilo && profilo.restaurantId !== restaurantId) {
      await abbonamentoRef.update({ daVerificare: 'email-gia-registrata' })
      console.error(`PROVISIONING DA FARE A MANO: l'email ${email} è di un altro account (ristorante ${restaurantId})`)
      return
    }
  } else {
    userRecord = await adminAuth.createUser({ email, displayName: nomeCliente, emailVerified: true })
  }
  const utente: AppUser = {
    uid: userRecord.uid,
    email,
    role: 'manager',
    restaurantId,
    displayName: nomeCliente,
    createdAt: new Date().toISOString(),
  }
  await adminDb.collection('utenti').doc(userRecord.uid).set(utente)
  await abbonamentoRef.update({ managerUid: userRecord.uid })

  // ── 3. Email di benvenuto con il link per impostare la password ─────────
  if (!nuovoUtente) return
  try {
    const linkPassword = await adminAuth.generatePasswordResetLink(email, {
      url: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
    })
    await inviaEmailBenvenuto(email, linkPassword)
  } catch (err) {
    // Il provisioning è già completo: un errore email non deve farlo fallire.
    // Il link NON va nei log (vale come la password): si rigenera con
    // "password dimenticata" dalla pagina di login.
    console.error(`Invio email benvenuto fallito per ${email}: far usare "password dimenticata" su /login`, err)
  }
}

// Stato dell'abbonamento in config/billing quando la subscription cambia
// (rinnovo fallito, disdetta, cambio piano). Non sospende il ristorante:
// quella decisione resta al superadmin (campo "attivo").
const STATI_STRIPE: Record<string, BillingRistorante['statoAbbonamento']> = {
  active: 'attivo', trialing: 'attivo',
  past_due: 'scaduto', unpaid: 'scaduto', paused: 'scaduto',
  canceled: 'cancellato', incomplete_expired: 'cancellato',
}

async function aggiornaStatoAbbonamento(subscription: Stripe.Subscription) {
  const adminDb = getFirestore(getAdminApp())
  const restaurantId = (await adminDb.collection('abbonamenti').doc(subscription.id).get()).data()?.restaurantId
  if (!restaurantId) {
    console.log(`Subscription ${subscription.id} non associata a un ristorante: skip`)
    return
  }
  const statoAbbonamento = STATI_STRIPE[subscription.status]
  if (!statoAbbonamento) return // 'incomplete': ancora in attesa del primo pagamento

  const priceId = subscription.items.data[0]?.price.id
  const piano = (Object.keys(PIANI) as PianoId[]).find(p => PIANI[p].priceId === priceId)
  await adminDb.collection('ristoranti').doc(restaurantId).collection('config').doc('billing').set({
    statoAbbonamento,
    ...(piano ? { piano } : {}),
    updatedAt: new Date().toISOString(),
  }, { merge: true })
  console.log(`Abbonamento ${subscription.id} (ristorante ${restaurantId}): ${subscription.status} → ${statoAbbonamento}`)
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook non configurato' }, { status: 400 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err: any) {
    console.error('Firma webhook non valida:', err.message)
    return NextResponse.json({ error: 'Firma non valida' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await gestisciCheckoutCompletato(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await aggiornaStatoAbbonamento(event.data.object as Stripe.Subscription)
        break
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('ERRORE WEBHOOK PIATTAFORMA:', err)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
