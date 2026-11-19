import { formatMoney, poSiteName } from './utils.js'
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

// One MIME part: its headers, a blank line, the (already encoded) body.
const mimePart = (headers, body) => [...headers, '', body, '']

const escapeHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// A rich-text signature as plain text, for the plain-text half of the message.
export function signatureToText(html) {
  return String(html ?? '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Pictures saved inside the signature as data: addresses (a logo) can't be shown by most email programs, so each
// one becomes an inline attachment the HTML points at with cid:.
function pullInlineImages(html, salt) {
  const images = []
  const out = String(html).replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)\2/gi,
    (_m, pre, quote, mime, b64) => {
      const cid = `sig${images.length + 1}.${salt}@gcs`
      images.push({ cid, mime: mime.toLowerCase(), b64: b64.replace(/\s+/g, '') })
      return `${pre}${quote}cid:${cid}${quote}`
    }
  )
  return { html: out, images }
}

// `signatureHtml` (optional) is the sender's saved rich-text signature. With one, the message carries both a
// plain-text and an HTML version (the HTML ends with the signature, pictures included); without one it is a plain-text
// message as before. `cc` is optional.
export function buildEml({ to, cc, subject, body, attachment, signatureHtml }) {
  const salt = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const boundary = `----=_po_${salt}`
  const encoder = new TextEncoder()
  const bodyLines = String(body).replace(/\r?\n/g, CRLF)

  const head = [
    'X-Unsent: 1',
    `To: ${oneLine(to)}`,
    ...(oneLine(cc) ? [`Cc: ${oneLine(cc)}`] : []),
    `Subject: ${encodeHeader(oneLine(subject))}`,
    'MIME-Version: 1.0',
  ]
  const pdfPart = mimePart(
    [
      `Content-Type: ${attachment.mime}; name="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
    ],
    fold(toBase64(attachment.bytes))
  )

  if (!String(signatureHtml ?? '').trim()) {
    return [
      ...head,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      ...mimePart(['Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: base64'], fold(toBase64(encoder.encode(bodyLines)))),
      `--${boundary}`,
      ...pdfPart,
      `--${boundary}--`,
      '',
    ].join(CRLF)
  }

  // Rich text: mixed [ related [ alternative [ plain, html ], pictures ], pdf ]
  const { html: sigHtml, images } = pullInlineImages(signatureHtml, salt)
  const plainText = `${bodyLines}${CRLF}${CRLF}${signatureToText(signatureHtml).replace(/\r?\n/g, CRLF)}`
  const htmlText =
    '<html><body><div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">' +
    escapeHtml(String(body)).replace(/\r?\n/g, '<br>') +
    '</div><br>' +
    sigHtml +
    '</body></html>'
  const alt = `----=_alt_${salt}`
  const rel = `----=_rel_${salt}`
  const alternative = [
    `--${alt}`,
    ...mimePart(['Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: base64'], fold(toBase64(encoder.encode(plainText)))),
    `--${alt}`,
    ...mimePart(['Content-Type: text/html; charset="utf-8"', 'Content-Transfer-Encoding: base64'], fold(toBase64(encoder.encode(htmlText)))),
    `--${alt}--`,
  ]
  const related = [
    `--${rel}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    ...alternative,
    '',
    ...images.flatMap((img, i) => [
      `--${rel}`,
      ...mimePart(
        [
          `Content-Type: ${img.mime}; name="signature-${i + 1}.${img.mime.split('/')[1].replace('jpeg', 'jpg')}"`,
          'Content-Transfer-Encoding: base64',
          `Content-ID: <${img.cid}>`,
          `Content-Disposition: inline; filename="signature-${i + 1}.${img.mime.split('/')[1].replace('jpeg', 'jpg')}"`,
        ],
        fold(img.b64)
      ),
    ]),
    `--${rel}--`,
  ]
  return [
    ...head,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: multipart/related; boundary="${rel}"`,
    '',
    ...related,
    '',
    `--${boundary}`,
    ...pdfPart,
    `--${boundary}--`,
    '',
  ].join(CRLF)
}

// A draft with no attachment (the reminder email): same X-Unsent header, so it opens as a new message to send.
export function buildPlainEml({ to, subject, body }) {
  const encoder = new TextEncoder()
  return [
    'X-Unsent: 1',
    `To: ${oneLine(to)}`,
    `Subject: ${encodeHeader(oneLine(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    fold(toBase64(encoder.encode(String(body).replace(/\r?\n/g, CRLF)))),
    '',
  ].join(CRLF)
}

// The message that goes with a PO. Short on purpose: the PDF is the PO.
export function buildPoEmailBody(request, totals, label) {
  const lines = [
    'Hello,',
    '',
    `Please find Purchase Order ${label} attached (PDF).`,
    '',
    ...(request.program_name ? [`Project: ${request.program_name}`] : []),
    `Entity: ${request.projects?.name || '-'}`,
    ...(poSiteName(request) ? [`Site: ${poSiteName(request)}`] : []),
    `Grand Total: ${formatMoney(totals.grandTotal)} ${request.currency || 'CAD'}`,
  ]
  if (request.vendor_quote_number) lines.push(`Your quote #: ${request.vendor_quote_number}`)
  if (request.notes) lines.push('', `Notes: ${request.notes}`)
  lines.push('', 'Please reference the PO number on your invoice.', '', 'Thank you,')
  return lines.join('\n')
}
