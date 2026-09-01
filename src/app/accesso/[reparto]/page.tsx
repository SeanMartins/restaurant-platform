import { Suspense } from 'react'
import AccessoRapidoClient from './AccessoRapidoClient'

export default function Page({ params }: { params: { reparto: string } }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-8 h-8 border-4 border-red-400 border-t-transparent rounded-full animate-spin"/>
      </div>
    }>
      <AccessoRapidoClient params={params} />
    </Suspense>
  )
}
