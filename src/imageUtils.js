// Helpers for the reference image attached to each part on the Master List.

export const PART_IMAGE_BUCKET = 'part-images'

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
