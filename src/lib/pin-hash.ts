import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

// Hash del PIN/password dell'accesso rapido: in Firestore si salva solo
// "scrypt$<salt hex>$<hash hex>", mai il valore in chiaro.
export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(pin, salt, 32).toString('hex')}`
}

export function verificaPin(salvato: string, pin: string): boolean {
  const [algoritmo, saltHex, hashHex] = salvato.split('$')
  if (algoritmo !== 'scrypt' || !saltHex || !hashHex) return false
  const atteso = Buffer.from(hashHex, 'hex')
  return timingSafeEqual(scryptSync(pin, Buffer.from(saltHex, 'hex'), atteso.length), atteso)
}

// Confronto a tempo costante per i PIN ancora in chiaro (salvati prima
// dell'hash): vengono convertiti in hash al primo accesso riuscito.
export function verificaPinInChiaro(salvato: string, pin: string): boolean {
  const a = Buffer.from(salvato)
  const b = Buffer.from(pin)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function pinValido(tipo: 'pin' | 'testo', pin: string): boolean {
  return tipo === 'pin' ? /^\d{6}$/.test(pin) : pin.length >= 8 && pin.length <= 64
}
