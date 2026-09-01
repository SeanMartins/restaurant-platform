import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY mancante')
  resendClient = new Resend(apiKey)
  return resendClient
}

export async function inviaEmailBenvenuto(destinatario: string, linkImpostaPassword: string) {
  const from = process.env.EMAIL_FROM || 'Comanda <onboarding@resend.dev>'
  await getResend().emails.send({
    from,
    to: destinatario,
    subject: 'Benvenuto su Comanda — imposta la tua password',
    html: `
      <p>Ciao,</p>
      <p>Il tuo account Comanda è pronto. Imposta la password per accedere al pannello del tuo ristorante:</p>
      <p><a href="${linkImpostaPassword}">Imposta la tua password</a></p>
      <p>Dopo aver impostato la password potrai accedere da <a href="${process.env.NEXT_PUBLIC_APP_URL}/login">${process.env.NEXT_PUBLIC_APP_URL}/login</a>.</p>
    `,
  })
}
