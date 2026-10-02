// Reads a PDF's text layer in the browser (pdf.js) as positioned text items,
// one list per page: { str, x, y, w } with y measured from the TOP of the
// page. Position is what lets extractInvoice.js pair a label with the value
// beside/below it -- plain concatenated text interleaves columns and puts
// labels and values on the wrong lines.
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
      })
    }
    pages.push({ width: viewport.width, height: viewport.height, items })
  }
  return { pages, totalPages: doc.numPages }
}

export async function readPdfPages(file, maxPages = 4) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  try {
    const doc = await loadingTask.promise
    return await pagesFromPdfDoc(doc, maxPages)
  } finally {
    // Frees the worker's copy of the file; destroying the loading task
    // (not the document) is what pdf.js exposes for that.
    loadingTask.destroy()
  }
}
