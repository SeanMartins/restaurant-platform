export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PIANI, PianoId } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const { piano, email } = await req.json() as { piano: PianoId; email?: string }

    const pianoScelto = PIANI[piano]
    if (!pianoScelto || !pianoScelto.priceId) {
      return NextResponse.json({ success: false, error: 'Piano non valido' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: pianoScelto.priceId, quantity: 1 }],
      customer_email: email || undefined,
      success_url: `${appUrl}/prezzi/grazie`,
      cancel_url: `${appUrl}/prezzi`,
      metadata: { piano },
    })

    return NextResponse.json({ success: true, url: session.url })
  } catch (err: any) {
    console.error('ERRORE CHECKOUT:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
