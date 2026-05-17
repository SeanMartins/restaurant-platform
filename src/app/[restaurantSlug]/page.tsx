import { Suspense } from 'react'
import MenuPubblicoClient from './MenuPubblicoClient'

export default function Page({ params }: { params: { restaurantSlug: string } }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f5f5' }}>
        <div className="w-8 h-8 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/>
      </div>
    }>
      <MenuPubblicoClient params={params} />
    </Suspense>
  )
}
