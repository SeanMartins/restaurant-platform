import { Suspense } from 'react'
import DashboardReparto from '@/components/reparti/DashboardReparto'
export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"/></div>}><DashboardReparto reparto="bar" emoji="🍷" label="Bar" /></Suspense>
}
