import PricingCards from '@/components/PricingCards'

export default function PrezziPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-4xl w-full">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Comanda</h1>
        <p className="text-center text-gray-500 mb-12">Scegli il piano per il tuo ristorante</p>
        <PricingCards />
      </div>
    </div>
  )
}
