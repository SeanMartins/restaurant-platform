'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function HomePage() {
  const { appUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!appUser) {
      router.replace('/login')
      return
    }
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

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Caricamento...</p>
      </div>
    </div>
  )
}
