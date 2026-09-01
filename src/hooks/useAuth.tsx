'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import {
  signInWithEmailAndPassword, signOut as firebaseSignOut,
  onAuthStateChanged, User
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { getUtente } from '@/lib/firestore'
import type { AppUser } from '@/types'

interface AuthContextType {
  user: User | null
  appUser: AppUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, appUser: null, loading: true,
  login: async () => {}, logout: async () => {}
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const dati = await getUtente(u.uid)
        setAppUser(dati)
      } else {
        setAppUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const logout = async () => {
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, appUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

// Hook per proteggere le route per ruolo
export function useRequireRole(ruoloRichiesto: AppUser['role'] | AppUser['role'][]) {
  const { appUser, loading } = useAuth()
  const ruoli = Array.isArray(ruoloRichiesto) ? ruoloRichiesto : [ruoloRichiesto]
  const autorizzato = appUser ? ruoli.includes(appUser.role) : false
  return { appUser, loading, autorizzato }
}
