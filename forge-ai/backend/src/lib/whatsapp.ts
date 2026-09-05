import axios from 'axios'

export interface WASendResult {
  ok: boolean
  messageId?: string
  error?: string
}

// Send a free-form text message via WhatsApp Cloud API.
// Works for contacts that have opted-in or are within a 24-h service window.
// For cold first-contact, use sendTemplate() with a Meta-approved template.
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<WASendResult> {
  // Normalise: strip spaces/dashes, ensure international format, strip leading +
  const normalisedTo = to.replace(/[\s\-().]/g, '').replace(/^\+/, '')
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalisedTo,
        type: 'text',
        text: { preview_url: false, body },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    )
    return { ok: true, messageId: data?.messages?.[0]?.id }
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Unknown error'
    return { ok: false, error: msg }
  }
}

// Send a Meta-approved template message (required for cold/first-contact outreach).
// templateName must match exactly what's approved in Meta Business Manager.
// components is an array of parameter objects for template variables.
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode = 'en',
  components: any[] = [],
  phoneNumberId: string,
  accessToken: string,
): Promise<WASendResult> {
  const normalisedTo = to.replace(/[\s\-().]/g, '').replace(/^\+/, '')
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: normalisedTo,
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    )
    return { ok: true, messageId: data?.messages?.[0]?.id }
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Unknown error'
    return { ok: false, error: msg }
  }
}
