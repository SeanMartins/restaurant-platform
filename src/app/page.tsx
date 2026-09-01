'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import PricingCards from '@/components/PricingCards'

const FUNZIONALITA = [
  { emoji: '📱', titolo: 'Menu via QR', desc: 'Il cliente scansiona, ordina e paga dal telefono — nessuna app da scaricare.' },
  { emoji: '👨‍🍳', titolo: 'Reparti in tempo reale', desc: 'Cucina, bar, pizzeria, pasticceria e antipasti vedono solo i loro ordini, live.' },
  { emoji: '💰', titolo: 'Cassa integrata', desc: 'Conto per tavolo aggiornato in automatico, chiusura in un tocco.' },
  { emoji: '💳', titolo: 'Pagamento in cassa o online', desc: 'Il cliente sceglie: contanti/POS al tavolo, o carta e PayPal dal telefono.' },
  { emoji: '🎨', titolo: 'Grafica del tuo brand', desc: 'Colori, font e nome del locale, applicati automaticamente al menu.' },
  { emoji: '👥', titolo: 'Staff senza account', desc: 'I camerieri accedono con un PIN dal QR del reparto — zero email da gestire.' },
  { emoji: '📊', titolo: 'Statistiche esportabili', desc: 'Fatturato, piatti più venduti, orari di punta — export Excel e PDF.' },
  { emoji: '🪑', titolo: 'Tavoli e QR illimitati', desc: 'Genera, scarica e stampa i QR per tutti i tavoli del locale in blocco.' },
]

const FAQ = [
  { q: 'I miei clienti devono scaricare un’app?', a: 'No. Scansionano il QR sul tavolo e il menu si apre nel browser del telefono — funziona su qualsiasi smartphone, senza installare nulla.' },
  { q: 'Serve un tecnico per configurarlo?', a: 'No. Dopo l’iscrizione un wizard ti guida in pochi minuti: nome del locale, menu e tavoli. Puoi modificare tutto in qualsiasi momento dal pannello.' },
  { q: 'Posso disdire quando voglio?', a: 'Sì, l’abbonamento è mensile senza vincoli — puoi annullarlo quando vuoi dal tuo account Stripe.' },
  { q: 'Funziona anche se ho già un POS o un registratore di cassa?', a: 'Sì. Comanda gestisce ordini e conto per tavolo; il pagamento in cassa lo incassi con i tuoi strumenti abituali (POS, contanti). Se preferisci puoi anche attivare i pagamenti online direttamente dal telefono del cliente.' },
  { q: 'Cosa succede se non ho ancora il menu pronto?', a: 'Puoi inserire i piatti quando vuoi dal pannello Menu — anche uno alla volta, aggiornando prezzi e disponibilità in tempo reale.' },
]

export default function HomePage() {
  const { appUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading || !appUser) return
    switch (appUser.role) {
      case 'superadmin': router.replace('/admin'); break
      case 'manager':    router.replace('/dashboard'); break
      case 'cucina':     router.replace('/cucina'); break
      case 'pizzeria':   router.replace('/pizzeria'); break
      case 'bar':        router.replace('/bar'); break
      case 'pasticceria':router.replace('/pasticceria'); break
      case 'antipasti':  router.replace('/antipasti'); break
      case 'cassa':      router.replace('/cassa'); break
      default:           router.replace('/login')
    }
  }, [appUser, loading, router])

  if (loading || appUser) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* NAV */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-xl">🍽️ Comanda</span>
          <nav className="flex items-center gap-3">
            <a href="/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Accedi</a>
            <a href="#prezzi" className="text-sm bg-red-500 hover:bg-red-600 text-white font-medium px-4 py-2 rounded-xl transition">
              Inizia ora
            </a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
            Basta comande di carta perse in cucina.
          </h1>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            I tuoi clienti ordinano dal telefono scansionando il QR del tavolo. L&apos;ordine arriva subito in cucina,
            bar o pizzeria — e tu segui tutto dalla cassa, in tempo reale.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#prezzi" className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-3.5 rounded-xl transition">
              Inizia ora — da €79/mese
            </a>
            <a href="#come-funziona" className="border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-6 py-3.5 rounded-xl transition">
              Vedi come funziona
            </a>
          </div>
          <p className="text-sm text-gray-400 mt-4">Configurazione guidata in 5 minuti. Nessun vincolo, disdici quando vuoi.</p>
        </div>

        {/* Mockup illustrativo */}
        <div className="relative mx-auto">
          <div className="w-64 rounded-[2.5rem] border-8 border-gray-900 bg-white shadow-2xl overflow-hidden">
            <div className="bg-red-500 px-4 pt-6 pb-4">
              <p className="text-white font-bold">Trattoria Da Mario</p>
              <p className="text-white/70 text-xs mt-0.5">Tavolo 4 · 2 posti</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {[
                { nome: 'Tagliatelle al ragù', prezzo: '€ 12.00' },
                { nome: 'Cotoletta alla milanese', prezzo: '€ 16.50' },
                { nome: 'Tiramisù', prezzo: '€ 6.00' },
              ].map(p => (
                <div key={p.nome} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <span className="text-sm font-medium text-gray-800">{p.nome}</span>
                  <span className="text-sm font-bold text-red-500">{p.prezzo}</span>
                </div>
              ))}
              <div className="bg-red-500 text-white text-center text-sm font-semibold rounded-xl py-2.5 mt-1">
                Vedi ordine · € 34.50
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COME FUNZIONA */}
      <section id="come-funziona" className="bg-gray-50 py-20 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Come funziona per il cliente</h2>
          <p className="text-gray-500 text-center mb-12">Tre passaggi, zero attriti.</p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { n: '1', t: 'Scansiona il QR', d: 'Il codice è sul tavolo — nessuna app, si apre nel browser.' },
              { n: '2', t: 'Ordina dal telefono', d: 'Sceglie i piatti, li aggiunge al carrello e conferma l’ordine.' },
              { n: '3', t: 'Segue tutto in diretta', d: 'Vede lo stato dell’ordine — ricevuto, in preparazione, pronto.' },
            ].map(s => (
              <div key={s.n} className="text-center">
                <div className="w-12 h-12 rounded-full bg-red-500 text-white font-bold flex items-center justify-center mx-auto mb-4">
                  {s.n}
                </div>
                <h3 className="font-semibold text-gray-800 mb-1.5">{s.t}</h3>
                <p className="text-sm text-gray-500">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FUNZIONALITA */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Tutto quello che serve al tuo locale</h2>
        <p className="text-gray-500 text-center mb-12">In un unico pannello, dalla cucina alla cassa.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FUNZIONALITA.map(f => (
            <div key={f.titolo} className="border border-gray-100 rounded-2xl p-5 hover:border-red-200 hover:shadow-sm transition">
              <span className="text-2xl">{f.emoji}</span>
              <h3 className="font-semibold text-gray-800 mt-3 mb-1.5">{f.titolo}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COME INIZI TU */}
      <section className="bg-gray-50 py-20 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Come inizi tu</h2>
          <p className="text-gray-500 text-center mb-12">Dal pagamento al primo ordine, in una sera.</p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { n: '1', t: 'Scegli il piano', d: 'Ti iscrivi online in due minuti, nessuna chiamata commerciale.' },
              { n: '2', t: 'Configuri con il wizard', d: 'Nome, menu e tavoli — guidato passo passo, modificabile sempre.' },
              { n: '3', t: 'Stampi i QR e inizi', d: 'Un QR per tavolo, uno per reparto: pronti a ricevere ordini.' },
            ].map(s => (
              <div key={s.n} className="text-center">
                <div className="w-12 h-12 rounded-full bg-gray-900 text-white font-bold flex items-center justify-center mx-auto mb-4">
                  {s.n}
                </div>
                <h3 className="font-semibold text-gray-800 mb-1.5">{s.t}</h3>
                <p className="text-sm text-gray-500">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PREZZI */}
      <section id="prezzi" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Un prezzo semplice</h2>
        <p className="text-gray-500 text-center mb-12">Nessun costo di attivazione, nessun vincolo.</p>
        <PricingCards />
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-20 border-y border-gray-100">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">Domande frequenti</h2>
          <div className="flex flex-col gap-4">
            {FAQ.map(f => (
              <details key={f.q} className="bg-white border border-gray-100 rounded-2xl p-5 group">
                <summary className="font-medium text-gray-800 cursor-pointer list-none flex items-center justify-between">
                  {f.q}
                  <span className="text-gray-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <p className="text-sm text-gray-500 mt-3 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINALE */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Pronto a digitalizzare il tuo ristorante?</h2>
        <p className="text-gray-500 mb-8">Configurazione in 5 minuti. Disdici quando vuoi.</p>
        <a href="#prezzi" className="inline-block bg-red-500 hover:bg-red-600 text-white font-semibold px-8 py-4 rounded-xl transition">
          Inizia ora
        </a>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span>🍽️ Comanda</span>
          <a href="/login" className="hover:text-gray-600">Accedi al tuo pannello →</a>
        </div>
      </footer>
    </div>
  )
}
