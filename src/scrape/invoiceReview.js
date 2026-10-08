// Everything the "add invoice" screen needs from a chosen PDF: the invoice
// number and total read from it, and how it compares with the PO (returned as
// soon as they're worked out), plus -- `loadViews()`, which takes longer -- pictures
// of the invoice and the PO with the differing figures boxed.
//
// The reading and comparing are the important part; the pictures are a bonus
// drawn afterwards, so the screen is usable without them and a failure to make
// them (`loadViews()` resolves null) never gets in the way of adding the invoice.

export async function prepareInvoiceReview(file, request, poStamp = null) {
  const [{ readPdfPages, renderPdfPages }, { extractDocument }, { compareInvoiceToPo, locateMarks }] = await Promise.all([
    import('./readPdf.js'),
    import('./extractDocument.js'),
    import('./comparePo.js'),
  ])

  const { pages } = await readPdfPages(file)
  const extracted = extractDocument(pages)
  if (!extracted.hasText) return { hasText: false }

  const { checks, warnCount } = compareInvoiceToPo({ extracted, pages, request })

  async function loadViews() {
    try {
      const { buildPoPdf } = await import('../poPdf.js')
      const poPdf = await buildPoPdf(request, poStamp)
      const [poRead, poImages, invImages] = await Promise.all([
        readPdfPages(poPdf.bytes),
        renderPdfPages(poPdf.bytes),
        renderPdfPages(file),
      ])
      const warned = checks.filter((c) => c.status === 'warn')
      return {
        po: {
          title: `Purchase order ${request.po_number || `#${request.id}`}`,
          images: poImages,
          boxes: locateMarks(poRead.pages, warned.flatMap((c) => c.poMarks)),
        },
        invoice: {
          title: `Invoice — ${file.name}`,
          images: invImages,
          boxes: locateMarks(pages, warned.flatMap((c) => c.invMarks)),
        },
      }
    } catch (error) {
      console.error("Couldn't draw the side-by-side view:", error)
      return null
    }
  }

  return { hasText: true, extracted, checks, warnCount, loadViews }
}
