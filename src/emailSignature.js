// A person's rich-text email signature (users.email_signature, an HTML string, see
// supabase/add_user_email_signature.sql). It is pasted from Outlook into the site, tidied here so that nothing
// that could run or track is stored, and added to the bottom of the email to a vendor (poEmail.js).

const REMOVE_TAGS = 'script,style,iframe,object,embed,link,meta,form,input,button,textarea,select,xml,noscript,svg,video,audio,base,title,head'
const LINK_OK = /^(https?:|mailto:|tel:)/i
const IMAGE_OK = /^(data:image\/(png|jpe?g|gif|webp);base64,|https?:)/i

// Largest signature we will store (pictures included), in characters of HTML.
export const MAX_SIGNATURE_CHARS = 1_500_000

// Returns { html, droppedImages }: the pasted HTML with scripts, event handlers, odd addresses and Outlook's
// leftover classes and comments removed. A picture whose address can't be used (Outlook pastes a logo as a
// file:/// path on your own computer, which nobody else can open) is taken out and counted.
export function cleanSignatureHtml(input) {
  const doc = new DOMParser().parseFromString(`<body>${input || ''}</body>`, 'text/html')
  doc.body.querySelectorAll(REMOVE_TAGS).forEach((n) => n.remove())

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  const comments = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach((c) => c.remove())

  let droppedImages = 0
  doc.body.querySelectorAll('*').forEach((el) => {
    if (el.tagName === 'IMG' && !IMAGE_OK.test((el.getAttribute('src') || '').trim())) {
      el.remove()
      droppedImages++
      return
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      if (name.startsWith('on') || name === 'class' || name === 'id') el.removeAttribute(attr.name)
      else if (name === 'href' || name === 'background' || name === 'action' || name === 'formaction' || name === 'xlink:href') {
        if (!LINK_OK.test(value)) el.removeAttribute(attr.name)
      } else if (name === 'src') {
        if (!IMAGE_OK.test(value)) el.removeAttribute(attr.name)
      } else if (name === 'style' && /expression\s*\(|javascript:|behavior\s*:/i.test(value)) el.removeAttribute(attr.name)
    }
  })
  return { html: doc.body.innerHTML.trim(), droppedImages }
}

// True when the HTML has no visible text and no picture (an empty box, or only line breaks).
export function isBlankSignature(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html')
  return !doc.body.textContent.trim() && !doc.body.querySelector('img')
}
