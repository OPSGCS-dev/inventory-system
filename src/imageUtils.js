// Helpers for the reference image attached to each part on the Master List.

export const PART_IMAGE_BUCKET = 'part-images'

// A datasheet is a file in this bucket (an uploaded PDF) or just a link to one somewhere else.
export const PART_DATASHEET_BUCKET = 'part-datasheets'
export const MAX_DATASHEET_BYTES = 25 * 1024 * 1024

// What was typed or pasted as a datasheet link, as a full web address; throws a message for the screen if
// it isn't one.
export function cleanDatasheetUrl(text) {
  let t = (text || '').trim()
  if (!t) throw new Error('Paste the link to the datasheet.')
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t
  let u
  try {
    u = new URL(t)
  } catch {
    throw new Error("That doesn't look like a web address.")
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('The link has to start with http:// or https://.')
  return u.toString()
}

// The object path inside the datasheet bucket, from a public URL (null for a link that points elsewhere).
export function partDatasheetPath(url) {
  if (!url) return null
  const marker = '/' + PART_DATASHEET_BUCKET + '/'
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

// Shrinks a picked image to at most `maxSize` px on its longest side and re-encodes it as a
// JPEG, so a 12 MB phone photo becomes ~100 KB and the popup loads instantly. Throws a message
// fit for the screen if the browser can't read the file (HEIC from some phones, for instance).
export async function shrinkImageToJpeg(file, maxSize = 900, quality = 0.85) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("That file couldn't be read as a picture. Use a JPG, PNG or WebP image.")
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff' // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))), 'image/jpeg', quality)
  })
}

// The object path inside the bucket, from a public URL (null if it isn't one of ours).
export function partImagePath(url) {
  if (!url) return null
  const marker = `/${PART_IMAGE_BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}
