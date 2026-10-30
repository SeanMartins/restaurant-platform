import { signInWithCustomToken, setPersistence, browserSessionPersistence, type User } from 'firebase/auth'
import { auth } from './firebase'

// ─── ACCESSO RAPIDO (PIN) ───────────────────────────────────────────────────
// Dopo il PIN, /api/accesso-rapido restituisce un custom token Firebase con i
// claims { accessoRapido, restaurantId, role }. Le regole Firestore si basano
// su quei claims, quindi la "sessione" non è più un flag in sessionStorage.

// Persistenza di sessione: come prima, l'accesso vale solo per la scheda
// aperta e sparisce alla chiusura.
export async function entraConTokenRapido(token: string) {
  await setPersistence(auth, browserSessionPersistence)
  await signInWithCustomToken(auth, token)
}

// true se l'utente corrente è entrato con PIN per questo ristorante e reparto
export async function haAccessoRapido(user: User | null, restaurantId: string, reparto: string) {
  if (!user) return false
  const { claims } = await user.getIdTokenResult()
  return claims.accessoRapido === true && claims.restaurantId === restaurantId && claims.role === reparto
}
