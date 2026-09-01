'use client'
import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Ristorante } from '@/types'
import toast from 'react-hot-toast'

interface ConfigPagamenti {
  abilitaPagamentiOnline: boolean
  stripe: { abilitato: boolean; publishableKey: string; secretKey: string; webhookSecret: string }
  paypal: { abilitato: boolean; clientId: string; clientSecret: string }
  satispay: { abilitato: boolean; apiKey: string }
  pagaInCassa: { abilitato: boolean }
}

const defaultConfig: ConfigPagamenti = {
  abilitaPagamentiOnline: false,
  stripe:   { abilitato: false, publishableKey: '', secretKey: '', webhookSecret: '' },
  paypal:   { abilitato: false, clientId: '', clientSecret: '' },
  satispay: { abilitato: false, apiKey: '' },
  pagaInCassa: { abilitato: true },
}

export default function PagamentiManager({ ristorante }: { ristorante: Ristorante }) {
  const [config, setConfig]   = useState<ConfigPagamenti>(defaultConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [mostraChiavi, setMostraChiavi] = useState<Record<string, boolean>>({})

  useEffect(() => { caricaConfig() }, [ristorante.id])

  const caricaConfig = async () => {
    try {
      const [pubSnap, segSnap] = await Promise.all([
        getDoc(doc(db, 'ristoranti', ristorante.id, 'config', 'pagamenti')),
        getDoc(doc(db, 'ristoranti', ristorante.id, 'config', 'pagamenti-secret')),
      ])
      const pub = pubSnap.exists() ? pubSnap.data() : {}
      const seg = segSnap.exists() ? segSnap.data() : {}
      setConfig({
        abilitaPagamentiOnline: pub.abilitaPagamentiOnline ?? defaultConfig.abilitaPagamentiOnline,
        pagaInCassa: { ...defaultConfig.pagaInCassa, ...pub.pagaInCassa },
        stripe: { ...defaultConfig.stripe, ...pub.stripe, ...seg.stripe },
        paypal: { ...defaultConfig.paypal, ...pub.paypal, ...seg.paypal },
        satispay: { ...defaultConfig.satispay, ...pub.satispay },
      })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const salva = async () => {
    setSaving(true)
    try {
      // "pagamenti" (pubblico, letto anche dal menu cliente senza auth): solo flag e chiavi pubblicabili
      const pubblico = {
        abilitaPagamentiOnline: config.abilitaPagamentiOnline,
        pagaInCassa: config.pagaInCassa,
        stripe:   { abilitato: config.stripe.abilitato, publishableKey: config.stripe.publishableKey },
        paypal:   { abilitato: config.paypal.abilitato, clientId: config.paypal.clientId },
        satispay: config.satispay,
      }
      // "pagamenti-secret" (solo manager, mai esposto al cliente): chiavi segrete
      const segreto = {
        stripe: { secretKey: config.stripe.secretKey, webhookSecret: config.stripe.webhookSecret },
        paypal: { clientSecret: config.paypal.clientSecret },
      }
      await Promise.all([
        setDoc(doc(db, 'ristoranti', ristorante.id, 'config', 'pagamenti'), pubblico),
        setDoc(doc(db, 'ristoranti', ristorante.id, 'config', 'pagamenti-secret'), segreto),
      ])
      toast.success('Impostazioni pagamenti salvate!')
    } catch { toast.error('Errore nel salvataggio') }
    finally { setSaving(false) }
  }

  const toggleChiave = (key: string) => setMostraChiavi(prev => ({ ...prev, [key]: !prev[key] }))

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="max-w-2xl">

      {/* Toggle principale */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Pagamenti online</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Abilita per permettere ai clienti di pagare dal telefono
            </p>
          </div>
          <button
            onClick={() => setConfig(c => ({ ...c, abilitaPagamentiOnline: !c.abilitaPagamentiOnline }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.abilitaPagamentiOnline ? 'bg-red-500' : 'bg-gray-200'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
              config.abilitaPagamentiOnline ? 'left-7' : 'left-1'
            }`}/>
          </button>
        </div>
      </div>

      {/* Paga in cassa — sempre visibile */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏪</span>
            <div>
              <h3 className="font-semibold text-gray-800">Paga in cassa</h3>
              <p className="text-sm text-gray-500">Contanti o POS al tavolo</p>
            </div>
          </div>
          <button
            onClick={() => setConfig(c => ({ ...c, pagaInCassa: { abilitato: !c.pagaInCassa.abilitato }}))}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.pagaInCassa.abilitato ? 'bg-red-500' : 'bg-gray-200'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
              config.pagaInCassa.abilitato ? 'left-7' : 'left-1'
            }`}/>
          </button>
        </div>
        <p className="text-xs text-gray-400 ml-11">
          Se abilitato, i clienti possono scegliere di pagare al tavolo invece che online
        </p>
      </div>

      {/* Metodi online — visibili solo se pagamenti online abilitati */}
      {config.abilitaPagamentiOnline && (
        <div className="flex flex-col gap-4">

          {/* STRIPE */}
          <div className={`bg-white rounded-2xl border p-6 transition-all ${
            config.stripe.abilitato ? 'border-blue-200' : 'border-gray-100'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Stripe</h3>
                  <p className="text-xs text-gray-500">Carte di credito e debito</p>
                </div>
              </div>
              <button
                onClick={() => setConfig(c => ({ ...c, stripe: { ...c.stripe, abilitato: !c.stripe.abilitato }}))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.stripe.abilitato ? 'bg-red-500' : 'bg-gray-200'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                  config.stripe.abilitato ? 'left-7' : 'left-1'
                }`}/>
              </button>
            </div>

            {config.stripe.abilitato && (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-50">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Publishable Key</label>
                  <div className="relative">
                    <input
                      type={mostraChiavi['stripe_pub'] ? 'text' : 'password'}
                      value={config.stripe.publishableKey}
                      onChange={e => setConfig(c => ({ ...c, stripe: { ...c.stripe, publishableKey: e.target.value }}))}
                      placeholder="pk_live_..."
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 pr-16"
                    />
                    <button type="button" onClick={() => toggleChiave('stripe_pub')}
                      className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600">
                      {mostraChiavi['stripe_pub'] ? 'Nascondi' : 'Mostra'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Secret Key</label>
                  <div className="relative">
                    <input
                      type={mostraChiavi['stripe_sec'] ? 'text' : 'password'}
                      value={config.stripe.secretKey}
                      onChange={e => setConfig(c => ({ ...c, stripe: { ...c.stripe, secretKey: e.target.value }}))}
                      placeholder="sk_live_..."
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 pr-16"
                    />
                    <button type="button" onClick={() => toggleChiave('stripe_sec')}
                      className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600">
                      {mostraChiavi['stripe_sec'] ? 'Nascondi' : 'Mostra'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Webhook Signing Secret</label>
                  <div className="relative">
                    <input
                      type={mostraChiavi['stripe_wh'] ? 'text' : 'password'}
                      value={config.stripe.webhookSecret}
                      onChange={e => setConfig(c => ({ ...c, stripe: { ...c.stripe, webhookSecret: e.target.value }}))}
                      placeholder="whsec_..."
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 pr-16"
                    />
                    <button type="button" onClick={() => toggleChiave('stripe_wh')}
                      className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600">
                      {mostraChiavi['stripe_wh'] ? 'Nascondi' : 'Mostra'}
                    </button>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-800">
                  Nel tuo account Stripe vai su <b>Developers → Webhooks → Add endpoint</b>, incolla questo URL,
                  seleziona l'evento <code>checkout.session.completed</code> e copia qui il "Signing secret" che ti mostra:
                  <div className="mt-1.5 font-mono bg-white border border-blue-200 rounded-lg px-2 py-1.5 break-all select-all">
                    {process.env.NEXT_PUBLIC_APP_URL}/api/pagamenti/stripe/webhook/{ristorante.id}
                  </div>
                </div>
                <a href="https://dashboard.stripe.com/apikeys" target="_blank"
                  className="text-xs text-blue-500 hover:underline">
                  Dove trovo le mie chiavi Stripe? ↗
                </a>
              </div>
            )}
          </div>

          {/* PAYPAL */}
          <div className={`bg-white rounded-2xl border p-6 transition-all ${
            config.paypal.abilitato ? 'border-yellow-200' : 'border-gray-100'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">PayPal</h3>
                  <p className="text-xs text-gray-500">Pagamento via account PayPal</p>
                </div>
              </div>
              <button
                onClick={() => setConfig(c => ({ ...c, paypal: { ...c.paypal, abilitato: !c.paypal.abilitato }}))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.paypal.abilitato ? 'bg-red-500' : 'bg-gray-200'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                  config.paypal.abilitato ? 'left-7' : 'left-1'
                }`}/>
              </button>
            </div>

            {config.paypal.abilitato && (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-50">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                  <div className="relative">
                    <input
                      type={mostraChiavi['paypal_id'] ? 'text' : 'password'}
                      value={config.paypal.clientId}
                      onChange={e => setConfig(c => ({ ...c, paypal: { ...c.paypal, clientId: e.target.value }}))}
                      placeholder="AaBb..."
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 pr-16"
                    />
                    <button type="button" onClick={() => toggleChiave('paypal_id')}
                      className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600">
                      {mostraChiavi['paypal_id'] ? 'Nascondi' : 'Mostra'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
                  <div className="relative">
                    <input
                      type={mostraChiavi['paypal_sec'] ? 'text' : 'password'}
                      value={config.paypal.clientSecret}
                      onChange={e => setConfig(c => ({ ...c, paypal: { ...c.paypal, clientSecret: e.target.value }}))}
                      placeholder="EeBb..."
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 pr-16"
                    />
                    <button type="button" onClick={() => toggleChiave('paypal_sec')}
                      className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600">
                      {mostraChiavi['paypal_sec'] ? 'Nascondi' : 'Mostra'}
                    </button>
                  </div>
                </div>
                <a href="https://developer.paypal.com/dashboard/applications" target="_blank"
                  className="text-xs text-blue-500 hover:underline">
                  Dove trovo le mie credenziali PayPal? ↗
                </a>
              </div>
            )}
          </div>

          {/* SATISPAY — non ancora integrato: richiede firma richieste con coppia di chiavi RSA, non una semplice API key */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Satispay</h3>
                  <p className="text-xs text-gray-500">Pagamento via app Satispay</p>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">In arrivo</span>
            </div>
          </div>
        </div>
      )}

      {/* Riepilogo metodi attivi */}
      <div className="bg-gray-50 rounded-2xl p-4 mt-6 mb-6">
        <p className="text-xs font-medium text-gray-600 mb-2">Metodi attivi nel menu clienti:</p>
        <div className="flex flex-wrap gap-2">
          {config.pagaInCassa.abilitato && (
            <span className="bg-white border border-gray-200 text-gray-700 text-xs px-3 py-1 rounded-full">🏪 Paga in cassa</span>
          )}
          {config.abilitaPagamentiOnline && config.stripe.abilitato && config.stripe.publishableKey && (
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-3 py-1 rounded-full">💳 Stripe</span>
          )}
          {config.abilitaPagamentiOnline && config.paypal.abilitato && config.paypal.clientId && (
            <span className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-1 rounded-full">🅿 PayPal</span>
          )}
          {!config.pagaInCassa.abilitato && !config.abilitaPagamentiOnline && (
            <span className="text-gray-400 text-xs">Nessun metodo abilitato</span>
          )}
        </div>
      </div>

      <button onClick={salva} disabled={saving}
        className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-semibold transition-colors">
        {saving ? 'Salvataggio...' : 'Salva impostazioni'}
      </button>
    </div>
  )
}
