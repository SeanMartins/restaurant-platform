export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/firebase-admin'
import { getStripe } from '@/lib/stripe'
import { inviaEmailBenvenuto } from '@/lib/resend'
import type { PianoId } from '@/lib/stripe'
import type { Ristorante, AppUser } from '@/types'

const COLORI_DEFAULT = { primario: '#E63946', secondario: '#457B9D', sfondo: '#F1FAEE', testo: '#1D3557' }

async function generaSlugUnivoco(adminDb: FirebaseFirestore.Firestore, base: string) {
  const radice = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ristorante'
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    const slug = tentativo === 0 ? radice : `${radice}-${Math.random().toString(36).slice(2, 6)}`
    const esiste = await adminDb.collection('ristoranti').where('slug', '==', slug).limit(1).get()
    if (esiste.empty) return slug
  }
  return `${radice}-${Date.now()}`
}

async function gestisciCheckoutCompletato(session: Stripe.Checkout.Session) {
  // Questo webhook gestisce solo gli abbonamenti alla piattaforma (mode: 'subscription').
  // I pagamenti dei singoli ordini ristorante (mode: 'payment') hanno il loro webhook dedicato
  // per-ristorante e non devono mai finire nel provisioning di un nuovo ristorante.
  if (session.mode !== 'subscription') {
    console.log(`Sessione Stripe con mode="${session.mode}", non è un abbonamento piattaforma: skip`)
    return
  }

  const email = session.customer_details?.email || session.customer_email
  if (!email) throw new Error('Email cliente mancante nella sessione Stripe')

  const piano = (session.metadata?.piano as PianoId) || 'base'
  const subscriptionId = String(session.subscription)
  const app = getAdminApp()
  const adminAuth = getAuth(app)
  const adminDb = getFirestore(app)

  // Idempotenza: Stripe può ri-consegnare lo stesso evento più volte.
  // Si verifica sulla subscription, non sull'email: un'email può già esistere
  // per altri motivi (es. account superadmin) senza che sia un duplicato di questo checkout.
  const giaProvisionato = await adminDb.collection('ristoranti').where('stripeSubscriptionId', '==', subscriptionId).limit(1).get()
  if (!giaProvisionato.empty) {
    console.log(`Provisioning già eseguito per la subscription ${subscriptionId}, skip`)
    return
  }

  const utenteEsistente = await adminAuth.getUserByEmail(email).catch(() => null)
  if (utenteEsistente) {
    throw new Error(`Esiste già un account Firebase con l'email ${email}: provisioning automatico non eseguito, serve intervento manuale`)
  }

  const nomeCliente = session.customer_details?.name || email.split('@')[0]
  const slug = await generaSlugUnivoco(adminDb, nomeCliente)

  const ristoranteRef = adminDb.collection('ristoranti').doc()
  const ristorante: Ristorante = {
    id: ristoranteRef.id,
    nome: nomeCliente,
    slug,
    colori: COLORI_DEFAULT,
    attivo: true,
    piano,
    statoAbbonamento: 'attivo',
    onboardingCompletato: false,
    stripeCustomerId: String(session.customer),
    stripeSubscriptionId: subscriptionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await ristoranteRef.set(ristorante)

  const userRecord = await adminAuth.createUser({ email, displayName: nomeCliente, emailVerified: true })
  const utente: AppUser = {
    uid: userRecord.uid,
    email,
    role: 'manager',
    restaurantId: ristorante.id,
    displayName: nomeCliente,
    createdAt: new Date().toISOString(),
  }
  await adminDb.collection('utenti').doc(userRecord.uid).set(utente)

  const linkPassword = await adminAuth.generatePasswordResetLink(email, {
    url: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
  })
  try {
    await inviaEmailBenvenuto(email, linkPassword)
  } catch (err) {
    // Il provisioning (ristorante + utente) è già completo: un errore email non deve farlo fallire
    console.error(`Invio email benvenuto fallito per ${email}, link da inviare manualmente: ${linkPassword}`, err)
  }
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
    if (event.type === 'checkout.session.completed') {
      await gestisciCheckoutCompletato(event.data.object as Stripe.Checkout.Session)
    }
    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('ERRORE PROVISIONING:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
