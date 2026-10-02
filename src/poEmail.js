// Packs a purchase order into an email *draft file* (.eml) with its PDF
// attached. A mailto: link can't carry an attachment, but opening an .eml
// that carries the "X-Unsent: 1" header makes Outlook show it as a new message
// to edit and send -- addressed, with subject, body and the PDF already in.
//
// Pure functions over plain data (no DOM), so they can be tested from Node.

const CRLF = '\r\n'

// Non-ASCII text in a header (a dash in a subject, say) must be wrapped as an
// RFC 2047 "encoded word" or mail programs show it garbled.
function encodeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${toBase64(new TextEncoder().encode(value))}?=`
}

function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Base64 is folded to 76-character lines, as the format requires.
const fold = (b64) => b64.match(/.{1,76}/g)?.join(CRLF) ?? ''

// A header value can't contain a line break -- someone's name or a stray
// paste must not be able to inject another header.
const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim()

export function buildEml({ to, subject, body, attachment }) {
  const boundary = `----=_po_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const encoder = new TextEncoder()
  const bodyLines = String(body).replace(/\r?\n/g, CRLF)

  const parts = [
    'X-Unsent: 1',
    `To: ${oneLine(to)}`,
    `Subject: ${encodeHeader(oneLine(subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    fold(toBase64(encoder.encode(bodyLines))),
    '',
    `--${boundary}`,
    `Content-Type: ${attachment.mime}; name="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    '',
    fold(toBase64(attachment.bytes)),
    '',
    `--${boundary}--`,
    '',
  ]
  return parts.join(CRLF)
}

// The message that goes with a PO. Short on purpose: the PDF is the PO.
export function buildPoEmailBody(request, totals, label) {
  const lines = [
    'Hello,',
    '',
    `Please find Purchase Order ${label} attached (PDF).`,
    '',
    `Entity: ${request.projects?.name || '-'}`,
    `Grand Total: $${totals.grandTotal.toFixed(2)} ${request.currency || 'CAD'}`,
  ]
  if (request.vendor_quote_number) lines.push(`Your quote #: ${request.vendor_quote_number}`)
  if (request.notes) lines.push('', `Notes: ${request.notes}`)
  lines.push('', 'Please reference the PO number on your invoice.', '', 'Thank you,')
  return lines.join('\n')
}
