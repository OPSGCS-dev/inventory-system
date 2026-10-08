// Reads a PDF's text layer in the browser (pdf.js) as positioned text items,
// one list per page: { str, x, y, w, h } with y measured from the TOP of the
// page (the text's baseline) and h the text height. Position is what lets
// extractInvoice.js pair a label with the value beside/below it -- plain
// concatenated text interleaves columns and puts labels and values on the
// wrong lines.
//
// pdf.js and its worker are loaded on demand so they stay out of the main
// bundle until someone actually attaches a PDF.

export async function pagesFromPdfDoc(doc, maxPages) {
  const pages = []
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = []
    for (const it of content.items) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue
      items.push({
        str: it.str.trim(),
        x: it.transform[4],
        y: viewport.height - it.transform[5],
        w: it.width,
        h: it.height || Math.abs(it.transform[3]) || 0,
      })
    }
    pages.push({ width: viewport.width, height: viewport.height, items })
  }
  return { pages, totalPages: doc.numPages }
}

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

// pdf.js draws a PDF whose fonts aren't embedded (the PO PDF, and some vendor
// invoices, use plain Helvetica) from its own copy of the standard fonts. They
// live in public/pdfjs/standard_fonts (copied from node_modules/pdfjs-dist) and
// are only fetched when a page that needs them is drawn.
const FONT_URL = `${import.meta.env?.BASE_URL ?? '/'}pdfjs/standard_fonts/`

// `source` is a File or the PDF's bytes. pdf.js takes ownership of the buffer
// it's given, so bytes are copied -- the caller can keep using theirs.
async function pdfBytes(source) {
  if (source instanceof Uint8Array) return source.slice()
  return new Uint8Array(await source.arrayBuffer())
}

export async function readPdfPages(source, maxPages = 4) {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: await pdfBytes(source) })
  try {
    const doc = await loadingTask.promise
    return await pagesFromPdfDoc(doc, maxPages)
  } finally {
    // Frees the worker's copy of the file; destroying the loading task
    // (not the document) is what pdf.js exposes for that.
    loadingTask.destroy()
  }
}

// The first pages of a PDF as images (data URLs) `width` pixels wide, for
// showing a document next to another one.
export async function renderPdfPages(source, { maxPages = 4, width = 900 } = {}) {
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data: await pdfBytes(source), standardFontDataUrl: FONT_URL })
  try {
    const doc = await loadingTask.promise
    const images = []
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.85))
    }
    return images
  } finally {
    loadingTask.destroy()
  }
}
