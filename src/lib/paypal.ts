const PAYPAL_API = 'https://api-m.paypal.com'

export async function getPaypalAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('Autenticazione PayPal fallita — controlla Client ID e Secret')
  const data = await res.json()
  return data.access_token as string
}

export const PAYPAL_API_BASE = PAYPAL_API
