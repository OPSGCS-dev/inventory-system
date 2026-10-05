// Builds a PDF of a purchase order, laid out like the on-screen/printed PO
// (see the po-print-area in tabs/PurchaseOrdersTab.jsx) so what a vendor
// receives matches what's printed. Drawn directly rather than screenshotted,
// so the text stays sharp and selectable and the file stays small.
//
// jsPDF is loaded on demand -- nothing here costs anything until someone
// actually emails or downloads a PO.
import {
  COMPANY_ADDRESS_BLOCK,
  PO_INSTRUCTIONS,
  computeInvoicedTotal,
  computePoTotals,
  isNotToExceed,
  isOverSpendingCap,
  lineTotal,
  poHasParts,
} from './utils.js'

// The standard PDF fonts only cover Latin-1: swap the usual offenders (dashes,
// curly quotes) for plain ones and show anything else as "?" instead of
// letting it turn into garbage.
const clean = (value) =>
  String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[Ā-￿]/g, '?')

const money = (n) => `$${Number(n).toFixed(2)}`

export function poLabel(request) {
  return request.po_number || `#${request.id}`
}

// "PO-0042" -> "PO-0042.pdf"; anything awkward in a filename becomes a dash.
export function poPdfFilename(request) {
  // A request without a PO number yet (the PDF can be made once it's approved)
  // is named after the request instead.
  const base = request.po_number ? String(request.po_number) : `Request-${request.id}`
  return `${base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'PO'}.pdf`
}

// `stamp` is who approved it ({ name, signature (PNG data URL or null), date }),
// from approvalStamp() in utils.js; without one the Authorized-by lines stay blank.
export async function buildPoPdf(request, stamp = null) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 40
  const INK = 20
  const MUTED = 100
  let y = M

  const text = (str, x, yy, opts) => doc.text(clean(str), x, yy, opts)
  const needRoom = (h) => {
    if (y + h > pageH - M) {
      doc.addPage()
      y = M
    }
  }
  const finalY = () => doc.lastAutoTable.finalY

  // --- header: entity + company address on the left, title and meta on the right
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(INK)
  text(request.projects?.name || '-', M, y + 10)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED)
  COMPANY_ADDRESS_BLOCK.forEach((line, i) => text(line, M, y + 26 + i * 12))
  const addressBottom = y + 26 + COMPANY_ADDRESS_BLOCK.length * 12

  doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(INK)
  text('Purchase Order', pageW - M, y + 14, { align: 'right' })
  const metaW = 220
  autoTable(doc, {
    startY: y + 26,
    margin: { left: pageW - M - metaW },
    tableWidth: metaW,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3, textColor: INK, lineColor: [200, 200, 200] },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [242, 242, 242], cellWidth: 110 } },
    body: [
      ['PO Date', new Date(request.issued_at || Date.now()).toLocaleDateString()],
      ['PO #', clean(poLabel(request))],
      ['Chargeable Expense', request.chargeable_expense ? 'Yes' : 'No'],
    ],
  })
  y = Math.max(addressBottom, finalY()) + 20

  // --- parties
  const colW = (pageW - M * 2 - 24) / 2
  const party = (x, label, name, lines) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED)
    text(label, x, y)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(INK)
    text(name || '-', x, y + 14)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED)
    let yy = y + 28
    for (const line of lines) {
      for (const part of doc.splitTextToSize(clean(line), colW)) {
        doc.text(part, x, yy)
        yy += 12
      }
    }
    return yy
  }
  const vendorBottom = party(M, 'Vendor:', request.vendors?.name, (request.vendors?.address || '').split('\n').filter(Boolean))
  const billBottom = party(M + colW + 24, 'Bill To:', request.projects?.name, COMPANY_ADDRESS_BLOCK)
  y = Math.max(vendorBottom, billBottom) + 12

  // --- line items
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4, textColor: INK, lineColor: [200, 200, 200], overflow: 'linebreak' },
    headStyles: { fillColor: [230, 230, 230], textColor: INK, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 32 },
      1: { halign: 'center', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 62 },
      4: { halign: 'right', cellWidth: 66 },
    },
    head: [['Item', 'Qty', 'Description', 'Unit Price', 'Line Total']],
    body: (request.purchase_request_lines || []).map((l, i) => [
      String(i + 1),
      String(l.quantity ?? ''),
      clean(
        l.line_type === 'part'
          ? l.parts?.description
            ? `${l.parts.description}${l.description ? ` (${l.description})` : ''}`
            : // A consumable (or older unlinked line): its own part number + description.
              [l.vendor_part_number, l.description || l.new_part_name].filter(Boolean).join(' - ') || '-'
          : l.description || '-'
      ),
      l.unit_cost !== null && l.unit_cost !== undefined ? money(l.unit_cost) : '-',
      money(lineTotal(l)),
    ]),
  })
  y = finalY() + 18

  // --- site/notes on the left, totals on the right
  const totals = computePoTotals(request)
  const hasParts = poHasParts(request)
  const totalRows = [
    ['Subtotal', money(totals.subtotal)],
    ['Credit', `-${money(totals.credit)}`],
    ...(hasParts ? [['Shipping/Handling', money(totals.shipping)]] : []),
    ...(hasParts ? [['Vendor Mark-Up', `${totals.markupRate.toFixed(1)}% ${money(totals.markupAmount)}`]] : []),
    ['Sales Taxes', `${totals.taxRate.toFixed(1)}% ${money(totals.taxAmount)}`],
    ['Grand Total', money(totals.grandTotal)],
    ...(isNotToExceed(request)
      ? [
          [
            'Spending Cap',
            `${request.spending_cap ? money(request.spending_cap) : '-'} - Invoiced ${money(computeInvoicedTotal(request))}${
              isOverSpendingCap(request) ? ' (OVER CAP)' : ''
            }`,
          ],
        ]
      : []),
    ['Currency', request.currency || 'CAD'],
  ]
  needRoom(40 + totalRows.length * 18)
  const totalsW = 250
  const grandTotalRow = totalRows.findIndex(([label]) => label === 'Grand Total')
  autoTable(doc, {
    startY: y,
    margin: { left: pageW - M - totalsW },
    tableWidth: totalsW,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3, textColor: INK, lineColor: [200, 200, 200] },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [242, 242, 242], cellWidth: 105 }, 1: { halign: 'right' } },
    body: totalRows,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === grandTotalRow) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 10
      }
    },
  })
  const totalsBottom = finalY()

  const leftW = pageW - M * 2 - totalsW - 20
  doc.setFontSize(9).setTextColor(INK)
  let ly = y + 10
  const labelled = (label, value) => {
    doc.setFont('helvetica', 'bold')
    text(label, M, ly)
    const labelWidth = doc.getTextWidth(label) + 4
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(clean(value), Math.max(40, leftW - labelWidth))
    lines.forEach((part, i) => {
      doc.text(part, M + labelWidth, ly)
      if (i < lines.length - 1) ly += 12
    })
    ly += 16
  }
  labelled('Site:', request.sub_projects?.name || request.projects?.name || '-')
  labelled('Notes:', request.notes || '-')
  y = Math.max(totalsBottom, ly) + 22

  // --- instructions, reference, signature
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(INK)
  PO_INSTRUCTIONS.forEach((instruction, i) => {
    const lines = doc.splitTextToSize(clean(`${i + 1}. ${instruction}`), pageW - M * 2 - 12)
    needRoom(lines.length * 12 + 4)
    lines.forEach((part, j) => {
      doc.text(part, M + (j === 0 ? 0 : 12), y)
      y += 12
    })
    y += 2
  })
  y += 10
  needRoom(100)
  doc.setFontSize(8).setTextColor(MUTED)
  COMPANY_ADDRESS_BLOCK.forEach((line, i) => text(line, M, y + i * 11))
  doc.setFontSize(9).setTextColor(INK)
  text(`Additional Reference: Vendor Quote # ${request.vendor_quote_number || '-'}`, pageW - M, y + 8, { align: 'right' })
  y += COMPANY_ADDRESS_BLOCK.length * 11 + 28
  if (!stamp) {
    text('Authorized by: ____________________     Date: ____________________', M, y)
  } else {
    // Signature (or the name in script type if none is saved) sits on a rule,
    // with the printed name and the approval date beneath / beside it.
    needRoom(80)
    const ruleY = y + 40
    const signW = 200
    const dateX = M + signW + 40
    let drawn = false
    if (stamp.signature) {
      try {
        const props = doc.getImageProperties(stamp.signature)
        const scale = Math.min(signW / props.width, 38 / props.height)
        doc.addImage(stamp.signature, 'PNG', M + 2, ruleY - 2 - props.height * scale, props.width * scale, props.height * scale)
        drawn = true
      } catch {
        // an unreadable image falls back to the typed name below
      }
    }
    if (!drawn) {
      doc.setFont('times', 'italic').setFontSize(20).setTextColor(INK)
      text(stamp.name || '', M + 2, ruleY - 5)
    }
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(INK)
    text(stamp.date ? stamp.date.toLocaleDateString() : '', dateX + 2, ruleY - 5)
    doc.setDrawColor(60).setLineWidth(0.6)
    doc.line(M, ruleY, M + signW, ruleY)
    doc.line(dateX, ruleY, dateX + 110, ruleY)
    doc.setFontSize(8).setTextColor(MUTED)
    text(`Authorized by: ${stamp.name || '-'}`, M, ruleY + 11)
    text('Date', dateX, ruleY + 11)
  }

  return { bytes: new Uint8Array(doc.output('arraybuffer')), filename: poPdfFilename(request) }
}
