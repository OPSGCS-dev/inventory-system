import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PdfReadPanel from './PdfReadPanel.jsx'
import {
  poStatusLabel,
  workStatusLabel,
  paymentStatusLabel,
  findUserName,
  approvalStamp,
  userHasRole,
  canCreatePurchaseRequests,
  entitiesAllowedFor,
  isEntityAllowed,
  canMatchInvoices,
  canManagePayment,
  canApproveRequests,
  canIssuePurchaseOrder,
  canClosePo,
  canReopenRejected,
  workStatusEntries,
  statusOptions,
  PARTS_STATUS_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  partsStatus,
  poHasParts,
  poHasServices,
  linesHaveParts,
  linesHaveServices,
  consumableOverCap,
  compareInvoicesToPo,
  invoiceMatchText,
  getConsumableMaxUnitCost,
  computePaymentStatus,
  canMarkPaymentPaid,
  PAYMENT_STATUS_LABELS,
  PO_PROGRESS_STAGES,
  PO_PROGRESS_STAGE_LABELS,
  computePoProgressStage,
  lineTotal,
  filterPartsForSearch,
  describeLineInventory,
  isApprovedOrLater,
  canPreviewPo,
  buildPoMailto,
  computePoTotals,
  formatMoney,
  totalsByCurrencyText,
  budgetCategoryLabel,
  ticketRefLabel,
  ticketRefUrl,
  poEmailSubject,
  COMPANY_ADDRESS_BLOCK,
  poInstructions,
  PO_INVOICE_EMAIL_OPTIONS,
  PO_STATUS_ORDER,
  nextStepInfo,
  truncate,
  canConfirmReceipt,
  canEditPurchaseRequest,
  TICKETING_URL,
  isAdmin,
  isNotToExceed,
  computeInvoicedTotal,
  isOverSpendingCap,
  canApproveVendors,
  vendorApprovalStatus,
  vendorBlockReason,
  voidBlockReason,
} from '../utils'
import InvoicesPanel from './InvoicesPanel'
import MyInvoicesForApprovalTable from './MyInvoicesForApprovalTable'
import MyInvoicesToPayTable from './MyInvoicesToPayTable'
import { localDay } from './DateRange'
import InvoiceMatchChip from './InvoiceMatchChip'
import VendorRequestPanel from './VendorRequestPanel'
import VendorsToApproveTable from './VendorsToApproveTable'

function formatTicketNumber(n) {
  return `TK-${String(n).padStart(5, '0')}`
}

// The ticket a PO is linked to (a link to it in the ticket system), with Link / Change / Unlink
// for people who may edit the request. The ticket is identified by its number, typed in.
function TicketLinkEditor({ request, canEdit, busy, onSave }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const label = ticketRefLabel(request)
  const url = ticketRefUrl(request)

  async function save(value) {
    const ok = await onSave(request, value)
    if (ok) setEditing(false)
  }

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          autoFocus
          placeholder="TK-06-26-001 or TK-00042"
          value={text}
          style={{ width: 200 }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save(text)
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <button type="button" className="btn-primary" disabled={busy || !text.trim()} onClick={() => save(text)}>
          Save
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {label ? (
        <a href={url} target="_blank" rel="noreferrer">
          {label} ↗
        </a>
      ) : (
        '—'
      )}
      {canEdit && (
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setText(label || '')
              setEditing(true)
            }}
          >
            {label ? 'Change' : 'Link ticket'}
          </button>
          {label && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => save('')}>
              Unlink
            </button>
          )}
        </>
      )}
    </span>
  )
}

const PO_DESCRIPTION_MAX_LEN = 50

// Shorter wording for the list's Work column when a mixed PO stacks two badges.
const SHORT_WORK_LABELS = {
  partially_received: 'Part. Received',
  partial: 'Part. Complete',
}

// The summary list's progress stepper only covers the "in flight" statuses —
// a draft hasn't entered the workflow yet, so every dot starts unfilled.
// 'in_progress'/'paid' aren't real status values -- they're display-only
// stages computed from the Work Status / Payment Status dropdowns while a
// PO sits at 'issued' (see computePoProgressStage).
const PO_PROGRESS_ALL_LABELS = PO_PROGRESS_STAGES.map((s) => PO_PROGRESS_STAGE_LABELS[s])

function PoProgressStepper({ request }) {
  if (request.status === 'voided') {
    return (
      <span className="po-badge po-badge-voided" title={request.void_reason || undefined}>
        Voided
      </span>
    )
  }
  if (request.status === 'rejected') {
    return (
      <span className="po-badge po-badge-rejected" title={request.rejection_reason || undefined}>
        Rejected
      </span>
    )
  }
  const stage = computePoProgressStage(request)
  const currentIndex = PO_PROGRESS_STAGES.indexOf(stage)
  const labels = PO_PROGRESS_ALL_LABELS
  const filled = PO_PROGRESS_STAGES.map((_, i) => i <= currentIndex)
  return (
    <div className="po-progress">
      {labels.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && <span className={`po-progress-line${filled[i] ? ' filled' : ''}`} />}
          <span className={`po-progress-dot${filled[i] ? ' filled' : ''}`} title={label} />
        </Fragment>
      ))}
    </div>
  )
}

function PurchaseOrdersTab({
  loggedInUser,
  users,
  vendors,
  poStatus,
  poStatusFilter,
  setPoStatusFilter,
  poProjectFilter,
  setPoProjectFilter,
  poView,
  setPoView,
  projects,
  poLoading,
  visiblePurchaseRequests,
  invoicesPendingApproval,
  invoicesToPay,
  poAttentionCounts,
  expandedPoId,
  toggleExpandedPo,
  poActivity,
  poActivityLoading,
  poFormOpen,
  openPoDraftForm,
  closePoDraftForm,
  poDraftId,
  poDraftProjectId,
  setPoDraftProjectId,
  poDraftSubProjectId,
  setPoDraftSubProjectId,
  subProjects,
  poDraftVendorId,
  setPoDraftVendorId,
  poDraftNotes,
  setPoDraftNotes,
  poDraftDescription,
  setPoDraftDescription,
  poDraftFieldErrors,
  poDraftBudgetCategoryId,
  setPoDraftBudgetCategoryId,
  poDraftBudgetSubcategoryId,
  setPoDraftBudgetSubcategoryId,
  budgetCategories,
  budgetSubcategories,
  poDraftChargeableExpense,
  setPoDraftChargeableExpense,
  poDraftInvoiceEmail,
  setPoDraftInvoiceEmail,
  poDraftVendorQuoteNumber,
  setPoDraftVendorQuoteNumber,
  poDraftQuoteFileUrl,
  poDraftQuoteFileName,
  poDraftNewQuoteFile,
  setPoDraftNewQuoteFile,
  clearPoDraftQuoteFile,
  applyPdfReadToDraft,
  handleRequestVendor,
  handleApproveVendor,
  handleRejectVendor,
  poDraftInvoiceNumber,
  setPoDraftInvoiceNumber,
  poDraftInvoiceAmount,
  setPoDraftInvoiceAmount,
  poDraftNewInvoiceFile,
  setPoDraftNewInvoiceFile,
  poDraftTicketSystemTicketId,
  poDraftTicketSystemTicketNumber,
  poDraftMarkupRate,
  setPoDraftMarkupRate,
  poDraftTaxRate,
  setPoDraftTaxRate,
  poDraftShippingHandling,
  setPoDraftShippingHandling,
  poDraftCredit,
  setPoDraftCredit,
  poDraftNotToExceed,
  setPoDraftNotToExceed,
  poDraftSpendingCap,
  setPoDraftSpendingCap,
  poDraftCurrency,
  setPoDraftCurrency,
  poDraftLines,
  handleAddPurchaseRequestLine,
  handleRemovePurchaseRequestLine,
  updatePoDraftLineField,
  parts,
  savingPoRequest,
  handleCreatePurchaseRequest,
  handleSubmitPurchaseRequest,
  handleSetTicketLink,
  handleApprovePurchaseRequest,
  handleHoldPurchaseRequest,
  handleResumeFromHold,
  handleRejectPurchaseRequest,
  handleReopenRejected,
  issuingRequestId,
  startIssuePurchaseOrder,
  cancelIssuePurchaseOrder,
  pendingPoNumber,
  computeNextPoNumber,
  computingPoNumber,
  handleIssuePurchaseOrder,
  handleSetWorkStatus,
  handleSetPaymentStatus,
  handleAddInvoice,
  handleApproveInvoice,
  handlePayInvoice,
  handleDeleteInvoice,
  handleAddReceipt,
  handleDeleteReceipt,
  handleMatchInvoiceReceipt,
  handleClosePo,
  poActionBusyId,
  handleDeletePurchaseRequest,
  handleVoidPurchaseRequest,
}) {
  const canCreate = canCreatePurchaseRequests(loggedInUser)
  // Linking a PO to a ticket: anyone who can raise requests for its entity, or an admin.
  const canEditTicketLink = (r) => isAdmin(loggedInUser) || canCreatePurchaseRequests(loggedInUser, r.project_id)
  const isAdminUser = isAdmin(loggedInUser)
  const canSeeApprovalsView = canApproveRequests(loggedInUser)
  const canSeeIssueView = canIssuePurchaseOrder(loggedInUser)
  const canSeeInvoicesView = userHasRole(loggedInUser, 'invoice_approval')
  const availableSubcategories = budgetSubcategories.filter(
    (sc) => sc.category_id === poDraftBudgetCategoryId
  )
  const availableSubProjects = subProjects.filter((sp) => sp.project_id === poDraftProjectId)
  const viewingRequest = expandedPoId ? visiblePurchaseRequests.find((r) => r.id === expandedPoId) : null

  // Date column: filter by a range of dates (both ends inclusive; the same day in both boxes
  // is that one day) and sort by it. The list the table shows; the lookups above and below
  // keep using the unfiltered one so a PO that is open never disappears from under you.
  const [poDateFrom, setPoDateFrom] = useState('')
  const [poDateTo, setPoDateTo] = useState('')
  const [poDateSort, setPoDateSort] = useState('desc') // newest first, as loaded
  const listedPurchaseRequests = useMemo(() => {
    let list = visiblePurchaseRequests
    if (poDateFrom) list = list.filter((r) => localDay(r.created_at) >= poDateFrom)
    if (poDateTo) list = list.filter((r) => localDay(r.created_at) <= poDateTo)
    const dir = poDateSort === 'asc' ? 1 : -1
    return [...list].sort((a, b) => (new Date(a.created_at) - new Date(b.created_at)) * dir)
  }, [visiblePurchaseRequests, poDateFrom, poDateTo, poDateSort])
  // Markup and shipping only apply to a PO with part lines; Not to Exceed only
  // to one with service lines -- the form shows each only then.
  const formHasParts = linesHaveParts(poDraftLines)
  const formHasServices = linesHaveServices(poDraftLines)

  // Toggled by the "View PO" button on the detail screen — shows the same
  // printable layout used by Print PO, just inline on screen instead of
  // off-screen-until-printed.
  const [showPoPreview, setShowPoPreview] = useState(false)

  // An approved request has no PO number until it is issued, but its printed PO
  // and PDF should already carry the number it will be issued with.
  const [peekedPo, setPeekedPo] = useState(null)
  const peekId = viewingRequest?.id
  const peekNeeded = viewingRequest?.status === 'approved' && !viewingRequest?.po_number
  useEffect(() => {
    if (!peekNeeded) return
    let cancelled = false
    computeNextPoNumber(viewingRequest)
      .then((number) => {
        if (!cancelled) setPeekedPo({ id: peekId, number })
      })
      .catch((error) => console.error(error))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId, peekNeeded])
  const shownPoNumber = (r) => r.po_number || (peekedPo?.id === r.id ? peekedPo.number : null)
  // The request as it should be printed or emailed, with the number it will be issued with.
  const withShownPoNumber = (r) => (shownPoNumber(r) && !r.po_number ? { ...r, po_number: shownPoNumber(r) } : r)

  // Collapsed by default -- the activity log is a secondary, rarely-needed
  // view, not something that should add height to every PO's detail page.
  const [showActivity, setShowActivity] = useState(false)

  // The Status heading + flow legend live above the table (so they can run
  // wider than the narrow Status column itself), but still need to sit
  // horizontally centered directly over that column — so its pixel center is
  // measured from the real header cell and used to offset the heading block,
  // recomputed on resize since the column widths are percentage-based.
  const sheetWrapRef = useRef(null)
  const statusHeaderRef = useRef(null)
  const [statusCenter, setStatusCenter] = useState(null)

  // Attaching a quote or invoice PDF reads it in the browser (see ../scrape):
  //  - on the invoice picker, the invoice # and total pre-fill the empty
  //    invoice fields;
  //  - on either picker, everything else it finds (entity, site, vendor, tax,
  //    shipping, markup, line items...) goes into a review box (`pdfRead`)
  //    where each item is applied only if checked, so nothing already on the
  //    form is silently overwritten.
  // The ref holds the latest form values for after the async read, and the
  // token drops a result whose file was replaced while it was being read.
  // "Email Vendor" can't be a mailto: link any more -- those can't carry the
  // PO's PDF. It builds the PDF and downloads an email draft (.eml) with the
  // PDF attached, which opens in the email program as a message ready to send.
  // If the PDF can't be built it falls back to the old plain-text email.
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailNote, setEmailNote] = useState(null)

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  async function downloadPoPdf(r) {
    setEmailBusy(true)
    try {
      const { buildPoPdf } = await import('../poPdf.js')
      const pdf = await buildPoPdf(withShownPoNumber(r), approvalStamp(users, r))
      downloadBlob(new Blob([pdf.bytes], { type: 'application/pdf' }), pdf.filename)
      setEmailNote({ id: r.id, text: `Downloaded ${pdf.filename}.` })
    } catch (error) {
      console.error(error)
      setEmailNote({ id: r.id, text: "Couldn't build the PDF — check the console for details." })
    } finally {
      setEmailBusy(false)
    }
  }

  async function emailVendorWithPdf(r) {
    // A vendor is only emailed once the PO has been issued and has its number.
    if (!r.po_number) {
      setEmailNote({ id: r.id, text: 'The vendor can only be emailed once the PO has been issued and has a PO number.' })
      return
    }
    setEmailBusy(true)
    try {
      const [{ buildPoPdf, poLabel }, { buildEml, buildPoEmailBody }] = await Promise.all([
        import('../poPdf.js'),
        import('../poEmail.js'),
      ])
      r = withShownPoNumber(r)
      const pdf = await buildPoPdf(r, approvalStamp(users, r))
      const label = poLabel(r)
      const eml = buildEml({
        to: r.vendors.email,
        subject: poEmailSubject(r),
        body: buildPoEmailBody(r, computePoTotals(r), label),
        attachment: { filename: pdf.filename, mime: 'application/pdf', bytes: pdf.bytes },
      })
      downloadBlob(new Blob([eml], { type: 'message/rfc822' }), `${pdf.filename.replace(/\.pdf$/, '')} - email to vendor.eml`)
      setEmailNote({
        id: r.id,
        text: `Open the downloaded file: it opens in your email program as a draft to ${r.vendors.email} with the PO PDF attached.`,
      })
    } catch (error) {
      console.error(error)
      setEmailNote({ id: r.id, text: "Couldn't attach the PDF, so a plain email (no attachment) was opened instead." })
      const plain = buildPoMailto(r)
      if (plain) window.location.href = plain
    } finally {
      setEmailBusy(false)
    }
  }

  // Which "Request a new vendor" panel is open: from the toolbar button
  // beside New Request, or from the form's Vendor field (null = neither).
  const [vendorPanel, setVendorPanel] = useState(null)
  const [pdfScan, setPdfScan] = useState(null)
  const [pdfRead, setPdfRead] = useState(null)
  const pdfScanToken = useRef(0)
  const formRef = useRef({})
  useEffect(() => {
    formRef.current = {
      poDraftInvoiceNumber,
      poDraftInvoiceAmount,
      poDraftCurrency,
      poDraftProjectId,
      poDraftSubProjectId,
      poDraftVendorId,
      poDraftTaxRate,
      poDraftShippingHandling,
      poDraftMarkupRate,
      poDraftVendorQuoteNumber,
      poDraftLines,
      projects,
      subProjects,
      vendors,
    }
  })

  function buildPdfRead(fileName, result, pages, matchers) {
    const cur = formRef.current
    const items = []
    const data = {}
    const notes = []
    const nameOf = (list, id) => list.find((r) => r.id === id)?.name || null
    const add = (key, label, value, current, extra) => items.push({ key, label, value, current, checked: true, ...extra })

    const entity = matchers.matchEntity(pages, cur.projects)
    if (entity && entity.id !== cur.poDraftProjectId) {
      data.entity = entity.id
      add('entity', 'Entity', entity.name, nameOf(cur.projects, cur.poDraftProjectId))
    }
    const entityId = entity ? entity.id : cur.poDraftProjectId
    const site = matchers.matchSubProject(pages, cur.subProjects.filter((sp) => sp.project_id === entityId))
    // Switching entity clears the site, so a site is offered whenever it differs
    // from what the form will hold after the entity is applied.
    if (site && (entity ? true : site.id !== cur.poDraftSubProjectId)) {
      data.site = site.id
      add('site', 'Site', site.name, entity ? null : nameOf(cur.subProjects, cur.poDraftSubProjectId))
    }
    const vendor = matchers.matchVendor(pages, cur.vendors)
    if (vendor && vendor.id !== cur.poDraftVendorId) {
      data.vendor = vendor.id
      add('vendor', 'Vendor', vendor.name, nameOf(cur.vendors, cur.poDraftVendorId))
    } else if (!vendor) {
      // Say what the letterhead reads, so a vendor that didn't match (a
      // differently-spelled or duplicate entry) is a quick pick, not a mystery.
      const letterhead = matchers.guessLetterhead(pages)
      if (letterhead) {
        notes.push(`Vendor on the document: "${letterhead}" — couldn't match it to one vendor in your list, so choose it by hand.`)
      }
    }

    const currency = result.amount?.currency
    if (currency && currency !== (cur.poDraftCurrency || 'CAD').trim().toUpperCase()) {
      data.currency = currency
      add('currency', 'Currency', currency, cur.poDraftCurrency || 'CAD')
    }
    if (result.quoteNumber && result.quoteNumber.value !== cur.poDraftVendorQuoteNumber.trim()) {
      data.quote = result.quoteNumber.value
      add('quote', 'Vendor quote #', result.quoteNumber.value, cur.poDraftVendorQuoteNumber.trim() || null)
    }
    if (result.tax && result.tax.rate !== null && Number(cur.poDraftTaxRate) !== result.tax.rate) {
      data.tax = result.tax.rate
      add('tax', 'Sales tax', `${result.tax.rate}%`, `${cur.poDraftTaxRate}%`)
    }

    // Each document line is a service or a part: the document's own wording
    // decides where it says so, otherwise a line with a part number is a part and
    // one without is a service. One PO can hold both.
    const docItems = result.lines ? result.lines.items : []
    const lineKind = (l) => l.kind || (l.partNumber ? 'part' : 'service')
    const docHasParts = docItems.some((l) => lineKind(l) === 'part')
    // Shipping and markup are fields of the PO and only apply while it has parts
    // (the markup only to those lines).
    const poHasPartLines = docItems.length > 0 ? docHasParts : linesHaveParts(cur.poDraftLines)

    // A vendor price with markup folded in goes into a part's unit cost without
    // it, and the Markup % carries the markup; a service has no markup, so its
    // price stays exactly as billed.
    const asPoLine = (l) => {
      const kind = lineKind(l)
      const unitPrice = kind === 'part' ? l.unitPrice : (l.billedUnitPrice ?? l.unitPrice)
      return { ...l, lineType: kind, unitPrice, amount: Math.round(l.quantity * unitPrice * 100) / 100 }
    }
    const summarise = (list) => {
      const sum = list.reduce((s, l) => s + l.amount, 0)
      return `${list.length} line${list.length === 1 ? '' : 's'}, ${sum.toFixed(2)} in total`
    }
    const unreconciled = result.lines && !result.lines.reconciled
    const reconcileWarn = unreconciled ? "These don't add up to the PDF's subtotal/total — check every line." : null

    if (poHasPartLines) {
      if (result.shipping > 0 && Number(cur.poDraftShippingHandling) !== result.shipping) {
        data.shipping = result.shipping
        add('shipping', 'Shipping / handling', result.shipping.toFixed(2), Number(cur.poDraftShippingHandling).toFixed(2))
      }
      if (result.markup && result.markup.rate !== null && Number(cur.poDraftMarkupRate) !== result.markup.rate) {
        data.markup = result.markup.rate
        add('markup', 'Markup', `${result.markup.rate}%`, `${cur.poDraftMarkupRate}%`)
        if (result.markup.embedded) {
          notes.push("The unit costs below are the vendor's price before markup — the Markup % puts it back, so keep both ticked.")
        }
      }
    }

    if (docItems.length > 0) {
      const lineItems = docItems.map(asPoLine)
      if (!docHasParts) {
        // No Shipping/Markup fields without parts: they come in as lines so the
        // totals still match the document.
        if (result.shipping > 0) {
          lineItems.push({ lineType: 'service', description: 'Shipping', partNumber: '', quantity: 1, unitPrice: result.shipping, amount: result.shipping })
        }
        if (result.markup && !result.markup.embedded) {
          const label = result.markup.rate !== null ? `Markup @ ${result.markup.rate}%` : 'Markup'
          lineItems.push({ lineType: 'service', description: label, partNumber: '', quantity: 1, unitPrice: result.markup.amount, amount: result.markup.amount })
        }
      }
      data.lines = lineItems
      const kinds = new Set(lineItems.map((l) => l.lineType))
      add('lines', kinds.size > 1 ? 'Line items' : kinds.has('part') ? 'Parts lines' : 'Service lines', summarise(lineItems), null, {
        lines: lineItems,
        warn: reconcileWarn,
      })
      if (!unreconciled) notes.push("The lines add up to the PDF's subtotal/total ✓")
    }

    return {
      fileName,
      items,
      data,
      notes,
      emptyNote: 'Nothing new to fill in from this PDF.',
    }
  }

  async function readPdfFile(file, source) {
    if (source === 'invoice') setPoDraftNewInvoiceFile(file)
    else setPoDraftNewQuoteFile(file)
    const token = ++pdfScanToken.current
    setPdfRead(null)
    if (!file) {
      setPdfScan(null)
      return
    }
    setPdfScan({ source, busy: true })
    try {
      const [{ readPdfPages }, { extractDocument }, matchers] = await Promise.all([
        import('../scrape/readPdf.js'),
        import('../scrape/extractDocument.js'),
        import('../scrape/matchers.js'),
      ])
      const { pages } = await readPdfPages(file)
      if (token !== pdfScanToken.current) return
      const result = extractDocument(pages)
      if (!result.hasText) {
        setPdfScan({ source, note: 'No readable text in this PDF (a scan?) — enter the details by hand.' })
        return
      }

      let note = ''
      if (source === 'invoice') {
        const cur = formRef.current
        const found = []
        if (result.invoiceNumber) {
          if (!cur.poDraftInvoiceNumber.trim()) setPoDraftInvoiceNumber(result.invoiceNumber.value)
          found.push(`Invoice # ${result.invoiceNumber.value}`)
        }
        if (result.amount) {
          if (cur.poDraftInvoiceAmount === '') setPoDraftInvoiceAmount(String(result.amount.value))
          found.push(`${result.amount.value.toFixed(2)}${result.amount.currency ? ` ${result.amount.currency}` : ''}`)
        }
        const missing = [!result.invoiceNumber && 'invoice number', !result.amount && 'total'].filter(Boolean)
        note = found.length ? `Read from the PDF: ${found.join(', ')}. Check before saving.` : ''
        if (missing.length) note += `${note ? ' ' : ''}Couldn't find the ${missing.join(' or ')} — enter it by hand.`
      }

      const read = buildPdfRead(file.name, result, pages, matchers)
      setPdfRead(read)
      if (source === 'quote') {
        note = read.items.length
          ? `Found ${read.items.length} thing${read.items.length === 1 ? '' : 's'} to fill in — review below.`
          : read.emptyNote
      } else if (read.items.length) {
        note += ' More to review below.'
      }
      setPdfScan({ source, note })
    } catch (error) {
      console.error(error)
      if (token === pdfScanToken.current) {
        setPdfScan({ source, note: "Couldn't read this PDF — enter the details by hand." })
      }
    }
  }

  function togglePdfReadItem(key) {
    setPdfRead((r) =>
      r ? { ...r, items: r.items.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)) } : r
    )
  }

  async function applyPdfRead() {
    const selection = {}
    for (const item of pdfRead.items) {
      if (item.checked) selection[item.key] = pdfRead.data[item.key]
    }
    const applied = await applyPdfReadToDraft(selection)
    if (applied) setPdfRead(null)
  }

  useLayoutEffect(() => {
    function recompute() {
      if (!sheetWrapRef.current || !statusHeaderRef.current) return
      const wrapRect = sheetWrapRef.current.getBoundingClientRect()
      const thRect = statusHeaderRef.current.getBoundingClientRect()
      setStatusCenter(thRect.left - wrapRect.left + sheetWrapRef.current.scrollLeft + thRect.width / 2)
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [poLoading, visiblePurchaseRequests.length])

  if (viewingRequest) {
    const r = viewingRequest
    const busy = poActionBusyId === r.id
    const issuingThis = issuingRequestId === r.id
    return (
      <>
        <div className="card">
          <div className="edit-toolbar">
            <button className="btn-secondary" onClick={() => toggleExpandedPo(r.id)}>
              ← Back to Purchase Orders
            </button>
          </div>
          {poStatus && <div className={'status ' + (poStatus.ok ? 'ok' : 'err')}>{poStatus.msg}</div>}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>
              Request #{r.id} — {r.projects?.name || '—'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isNotToExceed(r) && <span className="po-badge po-category-badge-nte">Not to Exceed</span>}
              <span className={`po-badge po-badge-${computePoProgressStage(r)}`}>
                {PO_PROGRESS_STAGE_LABELS[computePoProgressStage(r)] || poStatusLabel(r.status)}
              </span>
              {r.on_hold && <span className="po-badge po-badge-onhold">On Hold</span>}
              {isOverSpendingCap(r) && (
                <span className="po-badge po-badge-overcap">Over Spending Cap</span>
              )}
              {/* TEMPORARY (testing): admins can delete at any status; was drafts only. */}
              {isAdminUser && (
                <button
                  className="btn-secondary"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => handleDeletePurchaseRequest(r)}
                  disabled={busy}
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              )}
              {isAdminUser && !['draft', 'voided', 'closed'].includes(r.status) && (
                <button
                  className="btn-secondary"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => handleVoidPurchaseRequest(r)}
                  disabled={busy}
                  title={voidBlockReason(loggedInUser, r) || 'Void this PO — keeps it on file for accounting'}
                >
                  {busy ? 'Voiding…' : 'Void'}
                </button>
              )}
            </div>
          </div>

          <div className="po-detail-meta">
            <div className="po-detail-meta-item">
              <span className="po-detail-label">Vendor</span>
              <span className="po-detail-value">{r.vendors?.name || '—'}</span>
            </div>
            <div className="po-detail-meta-item">
              <span className="po-detail-label">PO #</span>
              <span className="po-detail-value">{r.po_number || '—'}</span>
            </div>
            {(() => {
              const match = compareInvoicesToPo(r)
              if (!match) return null
              return (
                <div className="po-detail-meta-item">
                  <span className="po-detail-label">Invoiced</span>
                  <span className="po-detail-value" title={invoiceMatchText(match)}>
                    ${match.invoiced.toFixed(2)} of ${match.expected.toFixed(2)}
                    <InvoiceMatchChip request={r} />
                  </span>
                </div>
              )
            })()}
            {r.sub_projects?.name && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Project</span>
                <span className="po-detail-value">{r.sub_projects.name}</span>
              </div>
            )}
            {isNotToExceed(r) && (
              <>
                <div className="po-detail-meta-item">
                  <span className="po-detail-label">Spending Cap</span>
                  <span className="po-detail-value">
                    {r.spending_cap ? `$${Number(r.spending_cap).toFixed(2)}` : '—'}
                  </span>
                </div>
                <div className="po-detail-meta-item">
                  <span className="po-detail-label">Invoiced to Date</span>
                  <span
                    className="po-detail-value"
                    style={isOverSpendingCap(r) ? { color: 'var(--danger)', fontWeight: 600 } : undefined}
                  >
                    ${computeInvoicedTotal(r).toFixed(2)}
                  </span>
                </div>
              </>
            )}
            {r.status === 'voided' && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Voided</span>
                <span className="po-detail-value" style={{ color: 'var(--danger)' }}>
                  {findUserName(users, r.voided_by)}
                  {r.voided_at ? ` — ${new Date(r.voided_at).toLocaleString()}` : ''}
                  {r.void_reason ? `: ${r.void_reason}` : ''}
                </span>
              </div>
            )}
            {r.status === 'rejected' && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Rejected</span>
                <span className="po-detail-value" style={{ color: 'var(--danger)' }}>
                  {findUserName(users, r.rejected_by)}
                  {r.rejected_at ? ` — ${new Date(r.rejected_at).toLocaleString()}` : ''}
                  {r.rejection_reason ? `: ${r.rejection_reason}` : ''}
                </span>
              </div>
            )}
            {r.on_hold && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">On Hold</span>
                <span className="po-detail-value">
                  {findUserName(users, r.held_by)}
                  {r.held_at ? ` — ${new Date(r.held_at).toLocaleString()}` : ''}
                  {r.hold_reason ? `: ${r.hold_reason}` : ''}
                </span>
              </div>
            )}
            {r.quote_file_url && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Quote</span>
                <span className="po-detail-value">
                  <a href={r.quote_file_url} target="_blank" rel="noreferrer">
                    {r.quote_file_name || 'View quote'} ↗
                  </a>
                </span>
              </div>
            )}
            {r.description && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Description</span>
                <span className="po-detail-value">{r.description}</span>
              </div>
            )}
            {r.budget_categories?.name && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Budget Category</span>
                <span className="po-detail-value">
                  {r.budget_categories.name}
                  {r.budget_subcategories?.name ? ` — ${r.budget_subcategories.name}` : ''}
                </span>
              </div>
            )}
            {(ticketRefLabel(r) || canEditTicketLink(r)) && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Ticket</span>
                <span className="po-detail-value">
                  <TicketLinkEditor
                    request={r}
                    canEdit={canEditTicketLink(r)}
                    busy={poActionBusyId === r.id}
                    onSave={handleSetTicketLink}
                  />
                </span>
              </div>
            )}
          </div>

          <table className="po-detail-timeline">
            <tbody>
              <tr>
                <th>Requested</th>
                <td>
                  {r.requested_by
                    ? `${findUserName(users, r.requested_by)} — ${new Date(
                        r.submitted_at
                      ).toLocaleString()}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>Approved</th>
                <td>
                  {r.approved_by
                    ? `${findUserName(users, r.approved_by)} — ${new Date(
                        r.approved_at
                      ).toLocaleString()}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>Issued</th>
                <td>
                  {r.issued_by
                    ? `${findUserName(users, r.issued_by)} — ${new Date(r.issued_at).toLocaleString()}`
                    : '—'}
                </td>
              </tr>
              {poHasServices(r) && (
                <tr>
                  <th>Completed</th>
                  <td>
                    {r.service_completed_by
                      ? `${findUserName(users, r.service_completed_by)} — ${new Date(
                          r.service_completed_at
                        ).toLocaleString()}`
                      : '—'}
                  </td>
                </tr>
              )}
              {(() => {
                // Who set the PO's Payment Status to Paid, and when. Read from the
                // activity log (every status change is logged with the person and
                // time), so it also covers POs marked paid before this row existed.
                // Blank again if the status has since been moved off Paid.
                let text = '—'
                if (computePaymentStatus(r) === 'paid') {
                  const entry = poActivity.find((a) => /→ Paid$/.test(a.note || ''))
                  if (entry) {
                    text = `${findUserName(users, entry.user_id)} — ${new Date(entry.created_at).toLocaleString()}`
                  } else if (poActivityLoading) {
                    text = 'Loading…'
                  }
                }
                return (
                  <tr>
                    <th>Paid</th>
                    <td>{text}</td>
                  </tr>
                )
              })()}
              {workStatusEntries(r).map((entry, _i, all) => (
                <tr key={entry.kind}>
                  <th>{all.length > 1 ? `${entry.label} Status` : 'PO Status'}</th>
                  <td>
                    {r.status === 'issued' && canConfirmReceipt(loggedInUser, r) ? (
                      <select
                        value={entry.status}
                        disabled={busy}
                        onChange={(e) => handleSetWorkStatus(r, entry.kind, e.target.value)}
                      >
                        {statusOptions(entry.kind === 'parts' ? PARTS_STATUS_OPTIONS : SERVICE_STATUS_OPTIONS).map(
                          ({ value, label }) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    ) : (
                      workStatusLabel(entry.status)
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <th>Payment Status</th>
                <td>
                  {r.status === 'issued' && canManagePayment(loggedInUser, r) ? (
                    <select
                      value={computePaymentStatus(r)}
                      disabled={busy}
                      onChange={(e) => handleSetPaymentStatus(r, e.target.value)}
                    >
                      {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                        <option
                          value={value}
                          key={value}
                          disabled={value === 'paid' && !canMarkPaymentPaid(r)}
                          title={
                            value === 'paid' && !canMarkPaymentPaid(r)
                              ? 'Every invoice must be marked paid first.'
                              : undefined
                          }
                        >
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    paymentStatusLabel(computePaymentStatus(r))
                  )}
                </td>
              </tr>
              {r.status === 'closed' && (
                <tr>
                  <th>Closed</th>
                  <td>
                    {r.closed_by
                      ? `${findUserName(users, r.closed_by)} — ${new Date(r.closed_at).toLocaleString()}`
                      : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <table className="sheet" style={{ marginBottom: 12, marginTop: 12 }}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr className="header-row">
                <th>Type</th>
                <th>Part / Description</th>
                <th className="center-cell">Qty</th>
                <th className="center-cell">Unit Cost</th>
                <th className="center-cell">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(r.purchase_request_lines || []).map((l) => (
                <tr key={l.id}>
                  <td>{l.line_type === 'part' ? 'Part' : 'Service'}</td>
                  <td>
                    {l.line_type === 'part'
                      ? l.part_gcs_id
                        ? `${l.parts?.gcs_id ?? l.part_gcs_id} — ${l.parts?.gcs_part_id || ''} — ${
                            l.parts?.description || ''
                          }${l.description ? ` (${l.description})` : ''}`
                        : // Not linked to a part (yet): a new part or a not-tracked line.
                          [l.vendor_part_number, l.new_part_name || l.description].filter(Boolean).join(' — ') || '—'
                      : l.description || '—'}
                    {l.line_type === 'part' &&
                      (() => {
                        const note = describeLineInventory(l, r.projects?.name, partsStatus(r) === 'received')
                        if (!note) return null
                        const outdated = ['add_new', 'not_tracked'].includes(l.inventory_action)
                        return (
                          <div className="sub" style={{ margin: '2px 0 0', color: outdated ? 'var(--danger)' : undefined }}>
                            {outdated ? '⚠ ' : ''}
                            {note}
                          </div>
                        )
                      })()}
                  </td>
                  <td className="center-cell">{l.quantity}</td>
                  <td className="center-cell">{l.unit_cost ?? '—'}</td>
                  <td className="center-cell">{lineTotal(l).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {r.notes && (
            <p className="sub" style={{ margin: '0 0 12px' }}>
              Notes: {r.notes}
            </p>
          )}

          {canPreviewPo(r.status) && (
            <div className={'po-print-area' + (showPoPreview ? ' po-print-area-preview' : '')}>
              {/* Until the PO is approved it is not a real PO yet: stamp it DRAFT across the page. */}
              {!isApprovedOrLater(r.status) && (
                <div className="po-watermark" aria-hidden="true">
                  DRAFT
                </div>
              )}
              <div className="po-print-header">
                <div className="po-print-header-left">
                  <p className="po-print-project-name">{r.projects?.name || '—'}</p>
                  <div className="po-print-address">
                    {COMPANY_ADDRESS_BLOCK.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
                <div className="po-print-header-right">
                  <h1 className="po-print-title">Purchase Order</h1>
                  <table className="po-print-meta">
                    <tbody>
                      <tr>
                        <th>PO Date</th>
                        <td>
                          {r.issued_at
                            ? new Date(r.issued_at).toLocaleDateString()
                            : new Date().toLocaleDateString()}
                        </td>
                      </tr>
                      <tr>
                        <th>PO #</th>
                        <td>{shownPoNumber(r) || `#${r.id}`}</td>
                      </tr>
                      <tr>
                        <th>Budget Category</th>
                        <td>{budgetCategoryLabel(r)}</td>
                      </tr>
                      <tr>
                        <th>Chargeable Expense</th>
                        <td>{r.chargeable_expense ? 'Yes' : 'No'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="po-print-parties">
                <div>
                  <p className="po-print-label">Vendor:</p>
                  <p className="po-print-strong">{r.vendors?.name || '—'}</p>
                  {r.vendors?.address && (
                    <div className="po-print-address">
                      {r.vendors.address.split('\n').map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="po-print-label">Bill To:</p>
                  <p className="po-print-strong">{r.projects?.name || '—'}</p>
                  <div className="po-print-address">
                    {COMPANY_ADDRESS_BLOCK.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
              </div>

              <table className="sheet po-print-lines">
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '6%' }} />
                  <col />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr className="header-row">
                    <th className="center-cell">Item</th>
                    <th className="center-cell">Qty</th>
                    <th>Description</th>
                    <th className="center-cell">Unit Price</th>
                    <th className="center-cell">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.purchase_request_lines || []).map((l, idx) => (
                    <tr key={l.id}>
                      <td className="center-cell">{idx + 1}</td>
                      <td className="center-cell">{l.quantity}</td>
                      <td>
                        {l.line_type === 'part'
                          ? l.parts?.description
                            ? `${l.parts.description}${l.description ? ` (${l.description})` : ''}`
                            : [l.vendor_part_number, l.description || l.new_part_name].filter(Boolean).join(' — ') || '—'
                          : l.description || '—'}
                      </td>
                      <td className="center-cell">
                        {l.unit_cost !== null && l.unit_cost !== undefined
                          ? `$${Number(l.unit_cost).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="center-cell">${lineTotal(l).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(() => {
                const totals = computePoTotals(r)
                return (
                  <div className="po-print-footer">
                    <div className="po-print-footer-left">
                      <p>
                        <strong>Site:</strong> {r.sub_projects?.name || r.projects?.name || '—'}
                      </p>
                      <p>
                        <strong>Notes:</strong> {r.notes || '—'}
                      </p>
                    </div>
                    <div className="po-print-totals">
                      <table>
                        <tbody>
                          <tr>
                            <th>Subtotal</th>
                            <td>${totals.subtotal.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <th>Credit</th>
                            <td>-${totals.credit.toFixed(2)}</td>
                          </tr>
                          {poHasParts(r) && (
                            <tr>
                              <th>Shipping/Handling</th>
                              <td>${totals.shipping.toFixed(2)}</td>
                            </tr>
                          )}
                          {poHasParts(r) && (
                            <tr>
                              <th>Vendor Mark-Up</th>
                              <td>
                                {totals.markupRate.toFixed(1)}% ${totals.markupAmount.toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <th>Sales Taxes</th>
                            <td>
                              {totals.taxRate.toFixed(1)}% ${totals.taxAmount.toFixed(2)}
                            </td>
                          </tr>
                          <tr className="po-print-grand-total">
                            <th>Grand Total</th>
                            <td>${totals.grandTotal.toFixed(2)}</td>
                          </tr>
                          {isNotToExceed(r) && (
                            <tr>
                              <th>Not to Exceed</th>
                              <td style={isOverSpendingCap(r) ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                                {r.spending_cap ? `$${Number(r.spending_cap).toFixed(2)}` : '—'}
                                {' · Invoiced $'}
                                {computeInvoicedTotal(r).toFixed(2)}
                                {isOverSpendingCap(r) ? ' (OVER LIMIT)' : ''}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <th>Currency</th>
                            <td>{r.currency || 'CAD'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* Wording lives in poInstructions (utils.js), shared with the emailed PDF */}
              <ol className="po-print-instructions">
                {poInstructions(r).map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ol>

              <div className="po-print-bottom">
                <div className="po-print-reference">
                  Additional Reference: Vendor Quote # {r.vendor_quote_number || '—'}
                </div>
              </div>

              {(() => {
                // Once approved, the approver's signature and approval date
                // are filled in; before that the lines are left blank.
                const stamp = approvalStamp(users, r)
                if (!stamp) {
                  return (
                    <div className="po-print-signature">
                      Authorized by: ____________________&nbsp;&nbsp;&nbsp;&nbsp; Date: ____________________
                    </div>
                  )
                }
                return (
                  <div className="po-print-signature po-print-signed">
                    <div className="po-signed-block">
                      <div className="po-signed-mark">
                        {stamp.signature ? (
                          <img src={stamp.signature} alt={`Signature of ${stamp.name}`} />
                        ) : (
                          <span className="po-signed-typed">{stamp.name}</span>
                        )}
                      </div>
                      <div className="po-signed-label">Authorized by: {stamp.name || '—'}</div>
                    </div>
                    <div className="po-signed-block">
                      <div className="po-signed-mark">
                        <span className="po-signed-date">{stamp.date ? stamp.date.toLocaleDateString() : ''}</span>
                      </div>
                      <div className="po-signed-label">Date</div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn-secondary" onClick={() => setShowActivity((v) => !v)}>
              {showActivity ? 'Hide Activity' : `View Activity${poActivity.length ? ` (${poActivity.length})` : ''}`}
            </button>
            {showActivity && (
              <div className="po-activity-list">
                {poActivityLoading ? (
                  <p className="sub" style={{ margin: '8px 0 0' }}>
                    Loading…
                  </p>
                ) : poActivity.length === 0 ? (
                  <p className="sub" style={{ margin: '8px 0 0' }}>
                    No activity logged yet.
                  </p>
                ) : (
                  poActivity.map((a) => (
                    <div key={a.id} className="po-activity-item">
                      <div className="po-activity-meta">
                        {findUserName(users, a.user_id)} — {new Date(a.created_at).toLocaleString()}
                      </div>
                      <div className="po-activity-note">{a.note}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="edit-toolbar">
            {r.status === 'draft' && (
              <>
                {canCreatePurchaseRequests(loggedInUser, r.project_id) && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      openPoDraftForm(r)
                      toggleExpandedPo(r.id)
                    }}
                  >
                    Edit Draft
                  </button>
                )}
                <button
                  className="btn-primary"
                  onClick={() => handleSubmitPurchaseRequest(r)}
                  disabled={busy || !canCreatePurchaseRequests(loggedInUser, r.project_id)}
                >
                  {busy ? 'Submitting…' : 'Submit'}
                </button>
                {!canCreatePurchaseRequests(loggedInUser, r.project_id) && (
                  <span className="sub" style={{ margin: 0 }}>
                    You don't have permission to submit requests.
                  </span>
                )}
              </>
            )}

            {r.status === 'submitted' && canEditPurchaseRequest(loggedInUser, r) && (
              <button
                className="btn-secondary"
                onClick={() => {
                  openPoDraftForm(r)
                  toggleExpandedPo(r.id)
                }}
              >
                Edit Request
              </button>
            )}

            {(() => {
              // A request can't be approved, nor its PO issued, until its vendor
              // is. A vendor approver can settle that right here.
              if (!['draft', 'submitted', 'approved'].includes(r.status)) return null
              const block = vendorBlockReason(r.vendors)
              if (!block) return null
              const pendingVendor = vendorApprovalStatus(r.vendors) === 'pending'
              return (
                <div style={{ flexBasis: '100%', color: 'var(--danger)' }}>
                  ⚠ {block}
                  {pendingVendor && canApproveVendors(loggedInUser) && (
                    <>
                      {' '}
                      <button className="btn-primary po-action-btn" onClick={() => handleApproveVendor(r.vendors)}>
                        Approve vendor
                      </button>{' '}
                      <button className="btn-secondary po-action-btn" onClick={() => handleRejectVendor(r.vendors)}>
                        Reject vendor
                      </button>
                    </>
                  )}
                </div>
              )
            })()}

            {r.status === 'submitted' &&
              (canApproveRequests(loggedInUser, r) ? (
                r.on_hold ? (
                  <>
                    <button
                      className="btn-primary"
                      onClick={() => handleResumeFromHold(r)}
                      disabled={busy}
                    >
                      {busy ? 'Resuming…' : 'Resume'}
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      onClick={() => handleRejectPurchaseRequest(r)}
                      disabled={busy}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-primary"
                      onClick={() => handleApprovePurchaseRequest(r)}
                      disabled={busy}
                    >
                      {busy ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => handleHoldPurchaseRequest(r)}
                      disabled={busy}
                    >
                      Hold
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      onClick={() => handleRejectPurchaseRequest(r)}
                      disabled={busy}
                    >
                      Reject
                    </button>
                  </>
                )
              ) : (
                <span className="sub" style={{ margin: 0 }}>
                  {r.on_hold ? 'On hold.' : 'Waiting on an approver.'}
                </span>
              ))}

            {r.status === 'rejected' &&
              (canReopenRejected(loggedInUser, r) ? (
                <button className="btn-primary" onClick={() => handleReopenRejected(r)} disabled={busy}>
                  {busy ? 'Working…' : 'Return to Draft'}
                </button>
              ) : (
                <span className="sub" style={{ margin: 0 }}>
                  Rejected — waiting on {findUserName(users, r.requested_by)} to revise it.
                </span>
              ))}

            {r.status === 'approved' &&
              (canIssuePurchaseOrder(loggedInUser, r) ? (
                issuingThis ? (
                  <>
                    <span className="sub" style={{ margin: 0 }}>
                      {computingPoNumber
                        ? 'Generating PO number…'
                        : `Assign PO number ${pendingPoNumber}?`}
                    </span>
                    <button
                      className="btn-primary"
                      onClick={() => handleIssuePurchaseOrder(r)}
                      disabled={busy || computingPoNumber || !pendingPoNumber}
                    >
                      {busy ? 'Issuing…' : 'Confirm PO'}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={cancelIssuePurchaseOrder}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={() => startIssuePurchaseOrder(r)}>
                    Issue PO
                  </button>
                )
              ) : (
                <span className="sub" style={{ margin: 0 }}>
                  Waiting on an approver to issue the PO.
                </span>
              ))}

            {r.status === 'issued' && canClosePo(loggedInUser, r) && (
              <button className="btn-primary" onClick={() => handleClosePo(r)} disabled={busy}>
                {busy ? 'Closing…' : 'Close PO'}
              </button>
            )}

            {r.status === 'closed' && (
              <span className="sub" style={{ margin: 0 }}>
                Closed.
              </span>
            )}

            {canPreviewPo(r.status) && (
              <button className="btn-secondary" onClick={() => setShowPoPreview((v) => !v)}>
                {showPoPreview ? 'Hide PO' : 'View PO'}
              </button>
            )}
            {r.receipt_file_url && (
              <a className="btn-secondary" href={r.receipt_file_url} target="_blank" rel="noreferrer">
                {poHasServices(r) && !poHasParts(r) ? 'View Service Report' : poHasParts(r) && !poHasServices(r) ? 'View Photo' : 'View Receipt File'}
              </a>
            )}
            {isApprovedOrLater(r.status) && canIssuePurchaseOrder(loggedInUser, r) && (
              <>
                <button className="btn-secondary" onClick={() => window.print()}>
                  Print PO
                </button>
                <button className="btn-secondary" onClick={() => downloadPoPdf(r)} disabled={emailBusy}>
                  Download PDF
                </button>
                {!r.po_number ? (
                  <span className="sub" style={{ margin: 0 }}>
                    Can be emailed to the vendor once the PO is issued.
                  </span>
                ) : r.vendors?.email ? (
                  <button className="btn-secondary" onClick={() => emailVendorWithPdf(r)} disabled={emailBusy}>
                    {emailBusy ? 'Preparing…' : 'Email Vendor'}
                  </button>
                ) : (
                  <span className="sub" style={{ margin: 0 }}>
                    No vendor email on file.
                  </span>
                )}
              </>
            )}
          </div>
          {emailNote && emailNote.id === r.id && (
            <p className="sub" style={{ margin: '6px 0 0' }}>
              {emailNote.text}
            </p>
          )}

          {(r.status === 'issued' || r.status === 'closed') && (
            <InvoicesPanel
              request={r}
              loggedInUser={loggedInUser}
              users={users}
              busy={busy}
              handleAddInvoice={handleAddInvoice}
              handleApproveInvoice={handleApproveInvoice}
              handlePayInvoice={handlePayInvoice}
              handleDeleteInvoice={handleDeleteInvoice}
              handleAddReceipt={handleAddReceipt}
              handleDeleteReceipt={handleDeleteReceipt}
              handleMatchInvoiceReceipt={handleMatchInvoiceReceipt}
              poPdfRequest={withShownPoNumber(r)}
              poStamp={approvalStamp(users, r)}
            />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="card">
        <div className="edit-toolbar">
          {canCreate && !poFormOpen && (
            <button className="btn-primary" onClick={() => openPoDraftForm(null)}>
              + New Request
            </button>
          )}
          {canCreate && !poFormOpen && vendorPanel !== 'toolbar' && (
            <button className="btn-secondary" onClick={() => setVendorPanel('toolbar')}>
              + Request Vendor
            </button>
          )}
        </div>

        {vendorPanel === 'toolbar' && !poFormOpen && (
          <VendorRequestPanel vendors={vendors} onSubmit={handleRequestVendor} onClose={() => setVendorPanel(null)} />
        )}

        {poStatus && <div className={'status ' + (poStatus.ok ? 'ok' : 'err')}>{poStatus.msg}</div>}
      </div>

      {poFormOpen && (
        <div className="card">
          <div className="card-header">
            <h2>{poDraftId ? 'Edit Request' : 'New Purchase Request'}</h2>
            {poDraftTicketSystemTicketNumber && (
              <a
                href={`${TICKETING_URL}/tickets/${poDraftTicketSystemTicketId}`}
                target="_blank"
                rel="noreferrer"
                className="sub"
              >
                🔗 Linked to {formatTicketNumber(poDraftTicketSystemTicketNumber)}
              </a>
            )}
          </div>

          <div className="field-row">
            <div>
              <label htmlFor="po_draft_project">Entity</label>
              <select
                id="po_draft_project"
                className={poDraftFieldErrors?.project ? 'field-invalid' : ''}
                value={poDraftProjectId ?? ''}
                onChange={(e) => {
                  setPoDraftProjectId(e.target.value ? Number(e.target.value) : null)
                  setPoDraftSubProjectId(null)
                }}
              >
                <option value="">Select an entity…</option>
                {entitiesAllowedFor(loggedInUser, 'purchase_req', projects)
                  // an entity already on an existing request stays in the list
                  .concat(projects.filter((p) => p.id === poDraftProjectId && !isEntityAllowed(loggedInUser, 'purchase_req', p.id)))
                  .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="po_draft_vendor">Vendor</label>
              <select
                id="po_draft_vendor"
                className={poDraftFieldErrors?.vendor ? 'field-invalid' : ''}
                value={poDraftVendorId ?? ''}
                onChange={(e) => setPoDraftVendorId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select a vendor…</option>
                {vendors
                  // Rejected vendors can't be chosen (unless one is already on
                  // this request, so it doesn't silently vanish from the field).
                  .filter((v) => vendorApprovalStatus(v) !== 'rejected' || v.id === poDraftVendorId)
                  .map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.name}
                      {vendorApprovalStatus(v) === 'pending' ? ' (pending approval)' : ''}
                      {vendorApprovalStatus(v) === 'rejected' ? ' (rejected)' : ''}
                    </option>
                  ))}
              </select>
              {vendorPanel !== 'form' && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: 6 }}
                  onClick={() => setVendorPanel('form')}
                >
                  + New vendor
                </button>
              )}
            </div>
          </div>

          {vendorPanel === 'form' && (
            <VendorRequestPanel
              vendors={vendors}
              onSubmit={handleRequestVendor}
              onUseExisting={(v) => {
                setPoDraftVendorId(v.id)
                setVendorPanel(null)
              }}
              onClose={(vendor) => {
                // A vendor just requested is picked on this request straight away.
                if (vendor) setPoDraftVendorId(vendor.id)
                setVendorPanel(null)
              }}
            />
          )}

          {availableSubProjects.length > 0 && (
            <div className="field-row" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="po_draft_sub_project">Project</label>
                <select
                  id="po_draft_sub_project"
                  className={poDraftFieldErrors?.subProject ? 'field-invalid' : ''}
                  value={poDraftSubProjectId ?? ''}
                  onChange={(e) => setPoDraftSubProjectId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select a project…</option>
                  {availableSubProjects.map((sp) => (
                    <option value={sp.id} key={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label htmlFor="po_draft_description" style={{ marginTop: 12 }}>
            Description
          </label>
          <input
            id="po_draft_description"
            type="text"
            placeholder="Short summary shown on the Purchase Requests list, e.g. Inverter fans for Site 4"
            value={poDraftDescription}
            onChange={(e) => setPoDraftDescription(e.target.value)}
          />

          <label htmlFor="po_draft_notes" style={{ marginTop: 12 }}>
            Notes
          </label>
          <input
            id="po_draft_notes"
            type="text"
            value={poDraftNotes}
            onChange={(e) => setPoDraftNotes(e.target.value)}
          />

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_budget_category">Budget Category *</label>
              <select
                id="po_draft_budget_category"
                className={poDraftFieldErrors?.budgetCategory ? 'field-invalid' : ''}
                value={poDraftBudgetCategoryId ?? ''}
                onChange={(e) => {
                  setPoDraftBudgetCategoryId(e.target.value ? Number(e.target.value) : null)
                  setPoDraftBudgetSubcategoryId(null)
                }}
              >
                <option value="">Select a budget category…</option>
                {budgetCategories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {availableSubcategories.length > 0 && (
              <div>
                <label htmlFor="po_draft_budget_subcategory">Sub-Category</label>
                <select
                  id="po_draft_budget_subcategory"
                  value={poDraftBudgetSubcategoryId ?? ''}
                  onChange={(e) =>
                    setPoDraftBudgetSubcategoryId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Select a sub-category…</option>
                  {availableSubcategories.map((sc) => (
                    <option value={sc.id} key={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_vendor_quote">Vendor Quote #</label>
              <input
                id="po_draft_vendor_quote"
                type="text"
                value={poDraftVendorQuoteNumber}
                onChange={(e) => setPoDraftVendorQuoteNumber(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="po_draft_chargeable">Chargeable Expense</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42 }}>
                <input
                  id="po_draft_chargeable"
                  type="checkbox"
                  checked={poDraftChargeableExpense}
                  onChange={(e) => setPoDraftChargeableExpense(e.target.checked)}
                />
                <span>{poDraftChargeableExpense ? 'Yes' : 'No'}</span>
              </div>
            </div>
            <div>
              <label htmlFor="po_draft_invoice_email">Send Invoices To</label>
              <select
                id="po_draft_invoice_email"
                value={poDraftInvoiceEmail}
                onChange={(e) => setPoDraftInvoiceEmail(e.target.value)}
              >
                {[...new Set([...PO_INVOICE_EMAIL_OPTIONS, poDraftInvoiceEmail])].filter(Boolean).map((email) => (
                  <option value={email} key={email}>
                    {email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_quote_file">Quote File</label>
              {poDraftQuoteFileUrl && !poDraftNewQuoteFile && (
                <div style={{ marginBottom: 6 }}>
                  <a href={poDraftQuoteFileUrl} target="_blank" rel="noreferrer">
                    {poDraftQuoteFileName || 'View quote'} ↗
                  </a>{' '}
                  <button type="button" className="btn-secondary" onClick={clearPoDraftQuoteFile}>
                    Remove
                  </button>
                </div>
              )}
              {poDraftNewQuoteFile && (
                <div style={{ marginBottom: 6 }}>
                  <span className="sub" style={{ margin: 0 }}>
                    {poDraftNewQuoteFile.name} (will upload on save)
                  </span>{' '}
                  <button type="button" className="btn-secondary" onClick={() => readPdfFile(null, 'quote')}>
                    Cancel
                  </button>
                </div>
              )}
              <input
                id="po_draft_quote_file"
                key={poDraftNewQuoteFile ? 'has-file' : 'no-file'}
                type="file"
                accept="application/pdf"
                onChange={(e) => readPdfFile(e.target.files?.[0] || null, 'quote')}
              />
              {pdfScan && pdfScan.source === 'quote' && poDraftNewQuoteFile && (
                <p className="sub" style={{ margin: '6px 0 0' }}>
                  {pdfScan.busy ? 'Reading the PDF…' : pdfScan.note}
                </p>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Invoice (optional)</label>
            <p className="sub" style={{ margin: '0 0 6px' }}>
              Already have the vendor's invoice? Attach it here — it's saved as an invoice on this
              request, the same as one added later from the request's Invoices section.
            </p>
            {(visiblePurchaseRequests.find((r) => r.id === poDraftId)?.invoices || []).length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <span className="sub" style={{ margin: 0 }}>
                  Already attached:{' '}
                  {(visiblePurchaseRequests.find((r) => r.id === poDraftId)?.invoices || []).map((inv, i) => (
                    <span key={inv.id}>
                      {i > 0 && ', '}
                      <a href={inv.file_url} target="_blank" rel="noreferrer">
                        {inv.invoice_number ? `#${inv.invoice_number}` : inv.file_name || 'Invoice'} ↗
                      </a>
                    </span>
                  ))}
                </span>
              </div>
            )}
            <div className="field-row">
              <div>
                <label htmlFor="po_draft_invoice_number">Invoice #</label>
                <input
                  id="po_draft_invoice_number"
                  type="text"
                  value={poDraftInvoiceNumber}
                  onChange={(e) => setPoDraftInvoiceNumber(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="po_draft_invoice_amount">Invoice Amount</label>
                <input
                  id="po_draft_invoice_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={poDraftInvoiceAmount}
                  onChange={(e) => setPoDraftInvoiceAmount(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="po_draft_invoice_file">Invoice File</label>
                {poDraftNewInvoiceFile && (
                  <div style={{ marginBottom: 6 }}>
                    <span className="sub" style={{ margin: 0 }}>
                      {poDraftNewInvoiceFile.name} (will upload on save)
                    </span>{' '}
                    <button type="button" className="btn-secondary" onClick={() => readPdfFile(null, 'invoice')}>
                      Cancel
                    </button>
                  </div>
                )}
                <input
                  id="po_draft_invoice_file"
                  key={poDraftNewInvoiceFile ? 'has-file' : 'no-file'}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => readPdfFile(e.target.files?.[0] || null, 'invoice')}
                />
              </div>
            </div>
            {pdfScan && pdfScan.source === 'invoice' && poDraftNewInvoiceFile && (
              <p className="sub" style={{ margin: '6px 0 0' }}>
                {pdfScan.busy ? 'Reading the PDF…' : pdfScan.note}
              </p>
            )}
          </div>

          {pdfRead && (poDraftNewQuoteFile || poDraftNewInvoiceFile) && (
            <PdfReadPanel
              read={pdfRead}
              onToggle={togglePdfReadItem}
              onApply={applyPdfRead}
              onDismiss={() => setPdfRead(null)}
            />
          )}

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_tax_rate">Sales Tax %</label>
              <input
                id="po_draft_tax_rate"
                type="number"
                min="0"
                step="0.1"
                value={poDraftTaxRate}
                onChange={(e) => setPoDraftTaxRate(e.target.value)}
              />
            </div>
          </div>

          {formHasParts && (
            <div className="field-row" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="po_draft_markup_rate">Markup %</label>
                <input
                  id="po_draft_markup_rate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={poDraftMarkupRate}
                  onChange={(e) => setPoDraftMarkupRate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="po_draft_shipping">Shipping/Handling</label>
                <input
                  id="po_draft_shipping"
                  type="number"
                  min="0"
                  step="0.01"
                  value={poDraftShippingHandling}
                  onChange={(e) => setPoDraftShippingHandling(e.target.value)}
                />
              </div>
            </div>
          )}

          {formHasServices && (
            <div className="field-row" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="po_draft_not_to_exceed" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    id="po_draft_not_to_exceed"
                    type="checkbox"
                    checked={poDraftNotToExceed}
                    onChange={(e) => {
                      setPoDraftNotToExceed(e.target.checked)
                      if (!e.target.checked) setPoDraftSpendingCap('')
                    }}
                  />
                  Not to Exceed
                </label>
              </div>
              {poDraftNotToExceed && (
                <div>
                  <label htmlFor="po_draft_spending_cap">Spending Cap</label>
                  <input
                    id="po_draft_spending_cap"
                    type="number"
                    min="0"
                    step="0.01"
                    value={poDraftSpendingCap}
                    onChange={(e) => setPoDraftSpendingCap(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="field-row" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="po_draft_credit">Credit</label>
              <input
                id="po_draft_credit"
                type="number"
                min="0"
                step="0.01"
                value={poDraftCredit}
                onChange={(e) => setPoDraftCredit(e.target.value)}
              />
            </div>
          </div>

          <label htmlFor="po_draft_currency" style={{ marginTop: 12 }}>
            Currency
          </label>
          <select
            id="po_draft_currency"
            value={poDraftCurrency}
            onChange={(e) => setPoDraftCurrency(e.target.value)}
          >
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
          </select>

          <div className="card-header" style={{ marginTop: 16 }}>
            <h2>Line Items</h2>
          </div>

          <div className={'sheet-wrap' + (poDraftFieldErrors?.lines ? ' field-invalid' : '')}>
            <table className="sheet">
              <colgroup>
                <col />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col className="col-last" />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th>Part / Description</th>
                  <th className="center-cell">Qty</th>
                  <th className="center-cell">Unit Cost</th>
                  <th className="center-cell">Line Total</th>
                  <th className="col-last"></th>
                </tr>
              </thead>
              <tbody>
                {poDraftLines.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={5}>
                      No line items yet — add a part or a service below.
                    </td>
                  </tr>
                ) : (
                  poDraftLines.map((line, i) => {
                    const entityName = projects.find((p) => p.id === poDraftProjectId)?.name || 'this entity'
                    const listed = filterPartsForSearch(parts, line.partSearch)
                    // Only a part that is on the entity's list shows as chosen: one
                    // that isn't (an older request, or the entity was changed) reads
                    // as not chosen yet, so a part has to be picked again.
                    const chosenOnList = parts.some((p) => p.gcs_id === line.part_gcs_id) ? line.part_gcs_id : ''
                    const needsAnswer = (poDraftFieldErrors?.incompleteLines || []).includes(line._tempId)
                    const mode = line.inventory_mode || ''
                    const setField = (field) => (e) => updatePoDraftLineField(i, field, e.target.value)
                    return (
                      <tr key={line._tempId}>
                        <td className={needsAnswer ? 'field-invalid' : ''}>
                          {line.line_type === 'part' ? (
                            <>
                              <select
                                className="part-picker-select"
                                value={mode}
                                onChange={setField('inventory_mode')}
                                aria-label="How this part is handled"
                              >
                                <option value="" disabled>
                                  Part — choose how it&apos;s handled…
                                </option>
                                <option value="spare">Spare — from the inventory list, added to stock when received</option>
                                <option value="used">Used immediately — from the inventory list, not added to stock</option>
                                <option value="consumable">
                                  {`Consumable — not tracked (max $${getConsumableMaxUnitCost().toLocaleString()} each)`}
                                </option>
                              </select>

                              {(mode === 'spare' || mode === 'used') && (
                                <>
                                  <input
                                    type="text"
                                    className="part-search-input"
                                    placeholder="Search GCS P/N, Part ID, mfr P/N or description…"
                                    value={line.partSearch}
                                    onChange={(e) => updatePoDraftLineField(i, 'partSearch', e.target.value)}
                                    style={{ marginTop: 4 }}
                                  />
                                  <select
                                    className="part-picker-select"
                                    value={chosenOnList}
                                    onChange={(e) =>
                                      updatePoDraftLineField(
                                        i,
                                        'part_gcs_id',
                                        e.target.value ? Number(e.target.value) : null
                                      )
                                    }
                                    style={{ marginTop: 4 }}
                                  >
                                    <option value="">Select a part from {entityName}&apos;s inventory list…</option>
                                    {listed.map((p) => (
                                      <option value={p.gcs_id} key={p.gcs_id}>
                                        {p.gcs_id} — {p.gcs_part_id} — {p.description || ''}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="Note (optional)"
                                    value={line.description}
                                    onChange={(e) => updatePoDraftLineField(i, 'description', e.target.value)}
                                    style={{ marginTop: 4 }}
                                  />
                                </>
                              )}

                              {mode === 'consumable' && (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Part number (if any)"
                                    value={line.vendor_part_number}
                                    onChange={setField('vendor_part_number')}
                                    style={{ marginTop: 4 }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Description (required)"
                                    value={line.description}
                                    onChange={(e) => updatePoDraftLineField(i, 'description', e.target.value)}
                                    style={{ marginTop: 4 }}
                                  />
                                  {consumableOverCap(line) && (
                                    <p className="sub" style={{ margin: '4px 0 0', color: 'var(--danger)' }}>
                                      {`Over the $${getConsumableMaxUnitCost().toLocaleString()} limit for a consumable — it has to be an inventory part, or go in a service line.`}
                                    </p>
                                  )}
                                </>
                              )}

                              {mode === '' && (line.vendor_part_number || line.description) && (
                                <p className="sub" style={{ margin: '4px 0 0' }}>
                                  {[line.vendor_part_number, line.description].filter(Boolean).join(' — ')}
                                </p>
                              )}
                            </>
                          ) : (
                            <input
                              type="text"
                              placeholder="Service description"
                              value={line.description}
                              onChange={(e) => updatePoDraftLineField(i, 'description', e.target.value)}
                            />
                          )}
                        </td>
                        <td className="center-cell">
                          <input
                            type="number"
                            min="0"
                            value={line.quantity}
                            onChange={(e) => updatePoDraftLineField(i, 'quantity', e.target.value)}
                          />
                        </td>
                        <td className="center-cell">
                          <input
                            type="number"
                            min="0"
                            max={mode === 'consumable' ? getConsumableMaxUnitCost() : undefined}
                            value={line.unit_cost}
                            onChange={(e) => updatePoDraftLineField(i, 'unit_cost', e.target.value)}
                          />
                        </td>
                        <td className="center-cell">{lineTotal(line).toFixed(2)}</td>
                        <td className="col-last">
                          <button className="del-btn" onClick={() => handleRemovePurchaseRequestLine(i)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="edit-toolbar" style={{ marginTop: 12 }}>
            <button className="btn-secondary" onClick={() => handleAddPurchaseRequestLine('part')}>
              + Add Part
            </button>
            <button className="btn-secondary" onClick={() => handleAddPurchaseRequestLine('service')}>
              + Add Service
            </button>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreatePurchaseRequest} disabled={savingPoRequest}>
              {savingPoRequest ? 'Saving…' : 'Save Draft'}
            </button>
            <button className="btn-secondary" onClick={closePoDraftForm} disabled={savingPoRequest}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="edit-toolbar">
          <button className={poView === 'all' ? 'btn-primary' : 'btn-secondary'} onClick={() => setPoView('all')}>
            All POs
          </button>
          {canSeeApprovalsView && (
            <button
              className={poView === 'my-approvals' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setPoView('my-approvals')}
            >
              My POs for Approval
              {poAttentionCounts.approvals > 0 && <span className="nav-badge">{poAttentionCounts.approvals}</span>}
            </button>
          )}
          {canSeeIssueView && (
            <button
              className={poView === 'my-issue' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setPoView('my-issue')}
            >
              My POs to Issue
              {poAttentionCounts.toIssue > 0 && <span className="nav-badge">{poAttentionCounts.toIssue}</span>}
            </button>
          )}
          {canApproveVendors(loggedInUser) && (
            <button
              className={poView === 'vendors' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setPoView('vendors')}
            >
              Vendors to Approve
              {poAttentionCounts.vendorsToApprove > 0 && (
                <span className="nav-badge">{poAttentionCounts.vendorsToApprove}</span>
              )}
            </button>
          )}
          {canSeeInvoicesView && (
            <button
              className={poView === 'my-invoices' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setPoView('my-invoices')}
            >
              My Invoices for Approval
              {poAttentionCounts.invoicesToApprove > 0 && (
                <span className="nav-badge">{poAttentionCounts.invoicesToApprove}</span>
              )}
            </button>
          )}
          {canManagePayment(loggedInUser) && (
            <button
              className={poView === 'my-pay' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setPoView('my-pay')}
            >
              My Invoices to Pay
              {poAttentionCounts.invoicesToPay > 0 && <span className="nav-badge">{poAttentionCounts.invoicesToPay}</span>}
            </button>
          )}
        </div>
      </div>

      {poView === 'my-pay' ? (
        <MyInvoicesToPayTable
          invoicesToPay={invoicesToPay}
          toggleExpandedPo={toggleExpandedPo}
          handlePayInvoice={handlePayInvoice}
          poActionBusyId={poActionBusyId}
        />
      ) : poView === 'vendors' ? (
        <VendorsToApproveTable
          vendors={vendors}
          users={users}
          onApprove={handleApproveVendor}
          onReject={handleRejectVendor}
        />
      ) : poView === 'my-invoices' ? (
        <MyInvoicesForApprovalTable
          invoicesPendingApproval={invoicesPendingApproval}
          toggleExpandedPo={toggleExpandedPo}
        />
      ) : (
      <div className="card">
        <div className="card-header">
          <h2>
            {poView === 'my-approvals'
              ? 'My POs for Approval'
              : poView === 'my-issue'
              ? 'My POs to Issue'
              : 'Purchase Requests'}{' '}
            {poLoading ? '' : `(${listedPurchaseRequests.length})`}
          </h2>
          <div className="header-actions">
            <label className="po-date-filter" title="Show POs created on or after this date">
              From
              <input type="date" value={poDateFrom} max={poDateTo || undefined} onChange={(e) => setPoDateFrom(e.target.value)} />
            </label>
            <label className="po-date-filter" title="Show POs created on or before this date">
              To
              <input type="date" value={poDateTo} min={poDateFrom || undefined} onChange={(e) => setPoDateTo(e.target.value)} />
            </label>
            {(poDateFrom || poDateTo) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPoDateFrom('')
                  setPoDateTo('')
                }}
              >
                Clear dates
              </button>
            )}
            <select value={poStatusFilter} onChange={(e) => setPoStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {PO_STATUS_ORDER.map((s) => (
                <option value={s} key={s}>
                  {poStatusLabel(s)}
                </option>
              ))}
            </select>
            <select value={poProjectFilter} onChange={(e) => setPoProjectFilter(e.target.value)}>
              <option value="">All Entities</option>
              {projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {poView === 'my-approvals' && !poLoading && listedPurchaseRequests.length > 0 && (
          <div className="sub" style={{ margin: '0 0 8px' }}>
            Total pending approval:{' '}
            <strong>
              {totalsByCurrencyText(
                listedPurchaseRequests.map((r) => ({ amount: computePoTotals(r).grandTotal, currency: r.currency }))
              )}
            </strong>
          </div>
        )}

        {poLoading ? (
          <div className="empty">Loading...</div>
        ) : listedPurchaseRequests.length === 0 ? (
          <div className="empty">{visiblePurchaseRequests.length === 0 ? 'No purchase requests yet.' : 'No purchase requests match the date range.'}</div>
        ) : (
          <div className="sheet-wrap" ref={sheetWrapRef}>
            <div className="po-progress-heading-block">
              <div
                className="po-progress-heading-inner"
                style={{ marginLeft: statusCenter ?? '50%', transform: 'translateX(-50%)' }}
              >
                <div className="po-progress-heading">Status</div>
                <div className="po-progress-flow-legend">
                  {PO_PROGRESS_ALL_LABELS.map((label, i) => (
                    <Fragment key={label}>
                      {i > 0 && <span className="po-progress-flow-arrow">→</span>}
                      <span>{label}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
            <table className="sheet po-summary-table">
              <colgroup>
                <col style={{ width: '36px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '190px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '85px' }} />
                {poView === 'my-approvals' && <col style={{ width: '120px' }} />}
                <col style={{ width: '170px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '75px' }} />
                <col style={{ width: '130px' }} />
                <col className="col-last" />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="row-head">ID</th>
                  <th aria-sort={poDateSort === 'asc' ? 'ascending' : 'descending'}>
                    <button
                      type="button"
                      className="sort-btn"
                      title="Date created. Click to reverse the order"
                      onClick={() => setPoDateSort((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    >
                      Date {poDateSort === 'asc' ? '▲' : '▼'}
                    </button>
                  </th>
                  <th>Description</th>
                  <th>Entity</th>
                  <th>Vendor</th>
                  {poView === 'my-approvals' && <th className="center-cell">Amount</th>}
                  <th ref={statusHeaderRef} className="center-cell">
                    Status
                  </th>
                  <th className="center-cell">Work</th>
                  <th className="center-cell">Payment</th>
                  <th>Requestor</th>
                  <th>Responsible for Next Action</th>
                  <th>PO #</th>
                  <th>Action</th>
                  <th className="col-last"></th>
                </tr>
              </thead>
              <tbody>
                {listedPurchaseRequests.map((r) => {
                  const next = nextStepInfo(r, users)
                  const busy = poActionBusyId === r.id
                  const paymentStatus = computePaymentStatus(r)
                  return (
                    <tr key={r.id}>
                      <td className="row-head">{r.id}</td>
                      <td className="nowrap-cell">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                      <td className="nowrap-cell" title={r.description || undefined}>
                        {r.description ? truncate(r.description, PO_DESCRIPTION_MAX_LEN) : '—'}
                      </td>
                      <td className="nowrap-cell">{r.projects?.name || '—'}</td>
                      <td className="nowrap-cell">{r.vendors?.name || '—'}</td>
                      {poView === 'my-approvals' && (
                        <td className="center-cell nowrap-cell">
                          {formatMoney(computePoTotals(r).grandTotal)}
                          {r.currency && r.currency.toUpperCase() !== 'CAD' ? ` ${r.currency.toUpperCase()}` : ''}
                        </td>
                      )}
                      <td className="center-cell">
                        <PoProgressStepper request={r} />
                      </td>
                      <td className="center-cell">
                        {(r.status === 'issued' || r.status === 'closed') && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                            {workStatusEntries(r).map((entry, _i, all) => (
                              <span key={entry.kind} className={`po-badge po-work-badge-${entry.status}`}>
                                {all.length > 1
                                  ? `${entry.label}: ${SHORT_WORK_LABELS[entry.status] || workStatusLabel(entry.status)}`
                                  : workStatusLabel(entry.status)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="center-cell">
                        {(r.status === 'issued' || r.status === 'closed') && (
                          <>
                            <span className={`po-badge po-payment-badge-${paymentStatus}`}>
                              {paymentStatusLabel(paymentStatus)}
                            </span>
                            <InvoiceMatchChip request={r} />
                          </>
                        )}
                      </td>
                      <td className="nowrap-cell">{findUserName(users, r.requested_by)}</td>
                      <td className="nowrap-cell">{next.who || '—'}</td>
                      <td className="nowrap-cell">{r.po_number || '—'}</td>
                      <td>
                        {r.status === 'draft' && canCreatePurchaseRequests(loggedInUser, r.project_id) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => handleSubmitPurchaseRequest(r)}
                            disabled={busy}
                          >
                            {busy ? 'Submitting…' : 'Submit'}
                          </button>
                        )}
                        {r.status === 'submitted' &&
                          canApproveRequests(loggedInUser, r) &&
                          (r.on_hold ? (
                            <button
                              className="btn-primary po-action-btn"
                              onClick={() => handleResumeFromHold(r)}
                              disabled={busy}
                            >
                              {busy ? 'Resuming…' : 'Resume'}
                            </button>
                          ) : (
                            <button
                              className="btn-primary po-action-btn"
                              onClick={() => handleApprovePurchaseRequest(r)}
                              disabled={busy}
                            >
                              {busy ? 'Approving…' : 'Approve'}
                            </button>
                          ))}
                        {r.status === 'approved' && canIssuePurchaseOrder(loggedInUser, r) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => {
                              startIssuePurchaseOrder(r)
                              toggleExpandedPo(r.id)
                            }}
                          >
                            Convert to PO
                          </button>
                        )}
                        {r.status === 'issued' && canMatchInvoices(loggedInUser, r) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => toggleExpandedPo(r.id)}
                          >
                            Upload Invoice
                          </button>
                        )}
                        {r.status === 'issued' && canConfirmReceipt(loggedInUser, r) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => toggleExpandedPo(r.id)}
                          >
                            Upload Receipt
                          </button>
                        )}
                        {r.status === 'issued' && canClosePo(loggedInUser, r) && (
                          <button
                            className="btn-primary po-action-btn"
                            onClick={() => handleClosePo(r)}
                            disabled={busy}
                          >
                            {busy ? 'Closing…' : 'Close PO'}
                          </button>
                        )}
                        {r.status === 'closed' && (
                          <span className="sub" style={{ margin: 0 }}>
                            Closed
                          </span>
                        )}
                      </td>
                      <td className="col-last">
                        <button className="btn-secondary" onClick={() => toggleExpandedPo(r.id)}>
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </>
  )
}

export default PurchaseOrdersTab
