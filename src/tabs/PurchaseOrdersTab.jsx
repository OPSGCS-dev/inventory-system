import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import PdfReadPanel from './PdfReadPanel.jsx'
import {
  poStatusLabel,
  workStatusLabel,
  paymentStatusLabel,
  findUserName,
  userHasRole,
  canCreatePurchaseRequests,
  canMatchInvoices,
  canManagePayment,
  canApproveRequests,
  canIssuePurchaseOrder,
  canClosePo,
  computeWorkStatus,
  computePaymentStatus,
  canMarkPaymentPaid,
  workStatusOptionsForCategory,
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
  COMPANY_ADDRESS_BLOCK,
  PO_STATUS_ORDER,
  nextStepInfo,
  truncate,
  canConfirmReceipt,
  canEditPurchaseRequest,
  poLineType,
  TICKETING_URL,
  isAdmin,
  PO_CATEGORY_OPTIONS,
  PO_CATEGORY_LABELS,
  poCategory,
  isNotToExceed,
  computeInvoicedTotal,
  isOverSpendingCap,
} from '../utils'
import InvoicesPanel from './InvoicesPanel'
import MyInvoicesForApprovalTable from './MyInvoicesForApprovalTable'

function formatTicketNumber(n) {
  return `TK-${String(n).padStart(5, '0')}`
}

const PO_DESCRIPTION_MAX_LEN = 50

// The summary list's progress stepper only covers the "in flight" statuses —
// a draft hasn't entered the workflow yet, so every dot starts unfilled.
// 'in_progress'/'paid' aren't real status values -- they're display-only
// stages computed from the Work Status / Payment Status dropdowns while a
// PO sits at 'issued' (see computePoProgressStage).
const PO_PROGRESS_ALL_LABELS = PO_PROGRESS_STAGES.map((s) => PO_PROGRESS_STAGE_LABELS[s])

function PoProgressStepper({ request }) {
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
  poDraftVendorQuoteNumber,
  setPoDraftVendorQuoteNumber,
  poDraftQuoteFileUrl,
  poDraftQuoteFileName,
  poDraftNewQuoteFile,
  setPoDraftNewQuoteFile,
  clearPoDraftQuoteFile,
  allParts,
  applyPdfReadToDraft,
  poDraftInvoiceNumber,
  setPoDraftInvoiceNumber,
  poDraftInvoiceAmount,
  setPoDraftInvoiceAmount,
  poDraftNewInvoiceFile,
  setPoDraftNewInvoiceFile,
  poDraftTicketSystemTicketId,
  poDraftTicketSystemTicketNumber,
  poDraftCategory,
  setPoDraftCategory,
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
  handleApprovePurchaseRequest,
  handleHoldPurchaseRequest,
  handleResumeFromHold,
  issuingRequestId,
  startIssuePurchaseOrder,
  cancelIssuePurchaseOrder,
  pendingPoNumber,
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
}) {
  const canCreate = canCreatePurchaseRequests(loggedInUser)
  const canDelete = isAdmin(loggedInUser)
  const canSeeApprovalsView = canApproveRequests(loggedInUser)
  const canSeeIssueView = canIssuePurchaseOrder(loggedInUser)
  const canSeeInvoicesView = userHasRole(loggedInUser, 'invoice_approval')
  const availableSubcategories = budgetSubcategories.filter(
    (sc) => sc.category_id === poDraftBudgetCategoryId
  )
  const availableSubProjects = subProjects.filter((sp) => sp.project_id === poDraftProjectId)
  const viewingRequest = expandedPoId ? visiblePurchaseRequests.find((r) => r.id === expandedPoId) : null

  // Toggled by the "View PO" button on the detail screen — shows the same
  // printable layout used by Print PO, just inline on screen instead of
  // off-screen-until-printed.
  const [showPoPreview, setShowPoPreview] = useState(false)

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
      poDraftCategory,
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

    // Shipping and markup are only fields on a Purchase PO; on a Service PO
    // they'd silently drop out of the totals, so they come in as lines instead.
    const isPurchase = cur.poDraftCategory === 'purchase'
    const docItems = result.lines ? result.lines.items : []
    const mixed = docItems.some((l) => l.kind === 'service') && docItems.some((l) => l.kind === 'part')

    // A Purchase PO has a Markup % field, so a vendor price with markup folded
    // in goes into the unit cost without it and the % carries the markup; a
    // Service PO has no markup, so the price stays exactly as billed.
    const asPoLine = (l, purchase = isPurchase) => {
      const unitPrice = purchase ? l.unitPrice : (l.billedUnitPrice ?? l.unitPrice)
      return { ...l, unitPrice, amount: Math.round(l.quantity * unitPrice * 100) / 100 }
    }
    const summarise = (list) => {
      const sum = list.reduce((s, l) => s + l.amount, 0)
      return `${list.length} line${list.length === 1 ? '' : 's'}, ${sum.toFixed(2)} in total`
    }
    const unreconciled = result.lines && !result.lines.reconciled
    const reconcileWarn = unreconciled ? "These don't add up to the PDF's own subtotal/total — check every line." : null

    // On a mixed document they belong to the parts side, so they're offered
    // too (ticked only while the parts group is) and follow its tick.
    if (isPurchase || mixed) {
      if (result.shipping > 0 && Number(cur.poDraftShippingHandling) !== result.shipping) {
        data.shipping = result.shipping
        add('shipping', 'Shipping / handling', result.shipping.toFixed(2), Number(cur.poDraftShippingHandling).toFixed(2), {
          checked: isPurchase,
        })
      }
      if (result.markup && result.markup.rate !== null && Number(cur.poDraftMarkupRate) !== result.markup.rate) {
        data.markup = result.markup.rate
        add('markup', 'Markup', `${result.markup.rate}%`, `${cur.poDraftMarkupRate}%`, { checked: isPurchase })
        if (result.markup.embedded) {
          notes.push("The unit costs below are the vendor's price before markup — the Markup % puts it back, so keep both ticked.")
        }
      }
    }

    if (mixed) {
      // Services and parts live on separate POs in this system, so a mixed
      // document is offered as two groups, one ticked at a time (a PO can't
      // mix the two). Ticking a group also switches the PO Category to match
      // when applied, and each group is priced for its own kind of PO (a
      // parts line carries its markup in the Markup %, a service line keeps
      // its billed price). Lines with no clear kind go with the form's own
      // category.
      const serviceLines = docItems
        .filter((l) => l.kind === 'service' || (l.kind === null && !isPurchase))
        .map((l) => asPoLine(l, false))
      const partLines = docItems
        .filter((l) => l.kind === 'part' || (l.kind === null && isPurchase))
        .map((l) => asPoLine(l, true))
      data.lines_service = serviceLines
      data.lines_part = partLines
      add('lines_service', 'Service lines', summarise(serviceLines), null, {
        lines: serviceLines,
        checked: !isPurchase,
        category: 'service',
        hint: isPurchase ? 'Ticking this switches the PO Category to Service.' : null,
        warn: reconcileWarn,
      })
      add('lines_part', 'Parts lines', summarise(partLines), null, {
        lines: partLines,
        checked: isPurchase,
        category: 'purchase',
        hint: !isPurchase ? 'Ticking this switches the PO Category to Purchase.' : null,
        warn: reconcileWarn,
      })
      notes.push(
        'This document mixes services and parts, which your system keeps on separate POs. Tick the group for this rec — the PO Category switches to match. After saving, attach the same document to a second rec for the other group.'
      )
      if (!unreconciled) notes.push("All the lines together add up to the PDF's subtotal/total ✓")
    } else if (docItems.length > 0) {
      const lineItems = docItems.map(asPoLine)
      if (!isPurchase) {
        // No Shipping/Markup fields on a Service PO: they come in as lines so
        // the totals still match the document.
        if (result.shipping > 0) {
          lineItems.push({ description: 'Shipping', partNumber: '', quantity: 1, unitPrice: result.shipping, amount: result.shipping })
        }
        if (result.markup && !result.markup.embedded) {
          const label = result.markup.rate !== null ? `Markup @ ${result.markup.rate}%` : 'Markup'
          lineItems.push({ description: label, partNumber: '', quantity: 1, unitPrice: result.markup.amount, amount: result.markup.amount })
        }
      }
      data.lines = lineItems
      add('lines', 'Line items', summarise(lineItems), null, { lines: lineItems, warn: reconcileWarn })
      if (!unreconciled) notes.push("The lines add up to the PDF's subtotal/total ✓")
      if (isPurchase && lineItems.every((l) => !l.partNumber)) {
        notes.push(
          'No part numbers found — if this is a service rather than parts, set PO Category to Service before applying.'
        )
      }
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
    setPdfRead((r) => {
      if (!r) return r
      const turningOn = !r.items.find((i) => i.key === key)?.checked
      return {
        ...r,
        items: r.items.map((i) => {
          if (i.key === key) return { ...i, checked: !i.checked }
          if (turningOn && key.startsWith('lines_')) {
            // Service lines and parts lines can't share one PO, so ticking one
            // group unticks the other...
            if (i.key.startsWith('lines_')) return { ...i, checked: false }
            // ...and shipping/markup are fields of a Purchase PO only, so they
            // follow the parts group.
            if (i.key === 'shipping' || i.key === 'markup') return { ...i, checked: key === 'lines_part' }
          }
          return i
        }),
      }
    })
  }

  async function applyPdfRead() {
    const selection = {}
    for (const item of pdfRead.items) {
      if (!item.checked) continue
      // Either line group is applied as "the lines" for this form, and its
      // kind decides the PO Category.
      if (item.key.startsWith('lines_')) {
        selection.lines = pdfRead.data[item.key]
        selection.category = item.category
      } else {
        selection[item.key] = pdfRead.data[item.key]
      }
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
              <span className={`po-badge po-category-badge-${poCategory(r)}`}>
                {PO_CATEGORY_LABELS[poCategory(r)]}
              </span>
              {isNotToExceed(r) && <span className="po-badge po-category-badge-nte">Not to Exceed</span>}
              <span className={`po-badge po-badge-${computePoProgressStage(r)}`}>
                {PO_PROGRESS_STAGE_LABELS[computePoProgressStage(r)] || poStatusLabel(r.status)}
              </span>
              {r.on_hold && <span className="po-badge po-badge-onhold">On Hold</span>}
              {isOverSpendingCap(r) && (
                <span className="po-badge po-badge-overcap">Over Spending Cap</span>
              )}
              {canDelete && (
                <button
                  className="btn-secondary"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => handleDeletePurchaseRequest(r)}
                  disabled={busy}
                >
                  {busy ? 'Deleting…' : 'Delete'}
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
            {r.ticket_system_ticket_id && (
              <div className="po-detail-meta-item">
                <span className="po-detail-label">Ticket</span>
                <span className="po-detail-value">
                  <a
                    href={`${TICKETING_URL}/tickets/${r.ticket_system_ticket_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatTicketNumber(r.ticket_system_ticket_number)} ↗
                  </a>
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
              <tr>
                <th>{poLineType(r) === 'service' ? 'Completed' : 'Received'}</th>
                <td>
                  {r.received_by
                    ? `${findUserName(users, r.received_by)} — ${new Date(
                        r.received_at
                      ).toLocaleString()}${r.receipt_file_name ? ` (${r.receipt_file_name})` : ''}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <th>PO Status</th>
                <td>
                  {r.status === 'issued' && canConfirmReceipt(loggedInUser, r) ? (
                    <select
                      value={computeWorkStatus(r)}
                      disabled={busy}
                      onChange={(e) => handleSetWorkStatus(r, e.target.value)}
                    >
                      {workStatusOptionsForCategory(poCategory(r)).map(({ value, label }) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    workStatusLabel(computeWorkStatus(r))
                  )}
                </td>
              </tr>
              <tr>
                <th>Payment Status</th>
                <td>
                  {r.status === 'issued' && canManagePayment(loggedInUser) ? (
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
                        const note = describeLineInventory(l, r.projects?.name, isApprovedOrLater(r.status))
                        if (!note) return null
                        return (
                          <div
                            className="sub"
                            style={{ margin: '2px 0 0', color: l.inventory_action === 'not_tracked' ? 'var(--danger)' : undefined }}
                          >
                            {l.inventory_action === 'not_tracked' ? '⚠ ' : '＋ '}
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
                        <td>{r.po_number || `#${r.id}`}</td>
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
                <thead>
                  <tr className="header-row">
                    <th>Item No.</th>
                    <th>GCS ID</th>
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
                      <td className="center-cell">
                        {l.line_type === 'part' ? l.parts?.gcs_id ?? l.part_gcs_id ?? '' : ''}
                      </td>
                      <td className="center-cell">{l.quantity}</td>
                      <td>
                        {l.line_type === 'part'
                          ? `${l.parts?.description || l.new_part_name || ''}${
                              l.description ? ` (${l.description})` : ''
                            }`
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
                          {poCategory(r) === 'purchase' && (
                            <tr>
                              <th>Shipping/Handling</th>
                              <td>${totals.shipping.toFixed(2)}</td>
                            </tr>
                          )}
                          {poCategory(r) === 'purchase' && (
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
                              <th>Spending Cap</th>
                              <td style={isOverSpendingCap(r) ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                                {r.spending_cap ? `$${Number(r.spending_cap).toFixed(2)}` : '—'}
                                {' · Invoiced $'}
                                {computeInvoicedTotal(r).toFixed(2)}
                                {isOverSpendingCap(r) ? ' (OVER CAP)' : ''}
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

              {/* PLACEHOLDER: user will provide exact wording + real invoice email later */}
              <ol className="po-print-instructions">
                <li>Please send the invoice to: [invoice email placeholder]</li>
                <li>
                  Enter this note in accordance with the prices, terms, delivery method, and
                  specifications listed above.
                </li>
                <li>Notify GCS immediately if PO number or work order is not specified.</li>
                <li>Reference the PO number on the invoice.</li>
                <li>Send all correspondence to: [same fixed company address block]</li>
              </ol>

              <div className="po-print-bottom">
                <div className="po-print-address po-print-address-small">
                  {COMPANY_ADDRESS_BLOCK.map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
                <div className="po-print-reference">
                  Additional Reference: Vendor Quote # {r.vendor_quote_number || '—'}
                </div>
              </div>

              <div className="po-print-signature">
                Authorized by: ____________________&nbsp;&nbsp;&nbsp;&nbsp; Date: ____________________
              </div>
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
                {canCreate && (
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
                  disabled={busy || !canCreate}
                >
                  {busy ? 'Submitting…' : 'Submit'}
                </button>
                {!canCreate && (
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

            {r.status === 'submitted' &&
              (canApproveRequests(loggedInUser, r) ? (
                r.on_hold ? (
                  <button
                    className="btn-primary"
                    onClick={() => handleResumeFromHold(r)}
                    disabled={busy}
                  >
                    {busy ? 'Resuming…' : 'Resume'}
                  </button>
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
                  </>
                )
              ) : (
                <span className="sub" style={{ margin: 0 }}>
                  {r.on_hold ? 'On hold.' : 'Waiting on an approver.'}
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
                {poLineType(r) === 'service' ? 'View Service Report' : 'View Photo'}
              </a>
            )}
            {isApprovedOrLater(r.status) && canIssuePurchaseOrder(loggedInUser, r) && (
              <>
                <button className="btn-secondary" onClick={() => window.print()}>
                  Print PO
                </button>
                {buildPoMailto(r) ? (
                  <a className="btn-secondary" href={buildPoMailto(r)}>
                    Email Vendor
                  </a>
                ) : (
                  <span className="sub" style={{ margin: 0 }}>
                    No vendor email on file.
                  </span>
                )}
              </>
            )}
          </div>

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
        </div>

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
                {projects.map((p) => (
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
                {vendors.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
              <label htmlFor="po_draft_budget_category">Budget Category</label>
              <select
                id="po_draft_budget_category"
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
              <label htmlFor="po_draft_category">PO Category</label>
              <select
                id="po_draft_category"
                value={poDraftCategory}
                onChange={(e) => setPoDraftCategory(e.target.value)}
              >
                {PO_CATEGORY_OPTIONS.map((c) => (
                  <option value={c.value} key={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
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

          {poDraftCategory === 'purchase' && (
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

          {poDraftCategory === 'service' && (
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
                      No line items yet — click "+ Add Line".
                    </td>
                  </tr>
                ) : (
                  poDraftLines.map((line, i) => {
                    const everyPart = allParts || parts
                    const part = line.part_gcs_id ? everyPart.find((p) => p.gcs_id === line.part_gcs_id) : null
                    const onEntityList = new Set(parts.map((p) => p.gcs_id))
                    const entityName = projects.find((p) => p.id === poDraftProjectId)?.name || 'this entity'
                    const searching = (line.partSearch || '').trim().length >= 2
                    const listed = filterPartsForSearch(parts, line.partSearch)
                    // Parts outside the entity's list only appear once you
                    // search, so the dropdown doesn't become the whole master list.
                    const others = searching
                      ? filterPartsForSearch(
                          everyPart.filter((p) => !onEntityList.has(p.gcs_id)),
                          line.partSearch
                        )
                      : []
                    const chosenElsewhere = part && !listed.includes(part) && !others.includes(part) ? part : null
                    const needsAnswer = (poDraftFieldErrors?.incompleteLines || []).includes(line._tempId)
                    const mode = line.inventory_mode || 'inventory'
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
                                aria-label="How this part relates to inventory"
                              >
                                <option value="inventory">Inventory part — pick from the list</option>
                                <option value="new">New part — add it to {entityName}&apos;s inventory</option>
                                <option value="not_tracked">Not tracked in inventory (needs a reason)</option>
                              </select>

                              {mode === 'inventory' && (
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
                                    value={line.part_gcs_id ?? ''}
                                    onChange={(e) =>
                                      updatePoDraftLineField(
                                        i,
                                        'part_gcs_id',
                                        e.target.value ? Number(e.target.value) : null
                                      )
                                    }
                                    style={{ marginTop: 4 }}
                                  >
                                    <option value="">Select a part…</option>
                                    {chosenElsewhere && (
                                      <option value={chosenElsewhere.gcs_id}>
                                        {chosenElsewhere.gcs_id} — {chosenElsewhere.gcs_part_id} — {chosenElsewhere.description || ''}
                                      </option>
                                    )}
                                    <optgroup label={`On ${entityName}'s inventory list`}>
                                      {listed.map((p) => (
                                        <option value={p.gcs_id} key={p.gcs_id}>
                                          {p.gcs_id} — {p.gcs_part_id} — {p.description || ''}
                                        </option>
                                      ))}
                                    </optgroup>
                                    {others.length > 0 && (
                                      <optgroup label="Other master-list parts — will be added to this entity's inventory">
                                        {others.map((p) => (
                                          <option value={p.gcs_id} key={p.gcs_id}>
                                            {p.gcs_id} — {p.gcs_part_id} — {p.description || ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </select>
                                  {part && !onEntityList.has(part.gcs_id) && (
                                    <p className="sub" style={{ margin: '4px 0 0' }}>
                                      Not on {entityName}&apos;s inventory list yet — it will be added when this request is approved.
                                    </p>
                                  )}
                                  {!part && !searching && (
                                    <p className="sub" style={{ margin: '4px 0 0' }}>
                                      Not on the list? Search above to find it elsewhere in the master list, or choose &quot;New part&quot;.
                                    </p>
                                  )}
                                </>
                              )}

                              {mode === 'new' && (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Vendor / manufacturer part number"
                                    value={line.vendor_part_number}
                                    onChange={setField('vendor_part_number')}
                                    style={{ marginTop: 4 }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Part name / description"
                                    value={line.new_part_name}
                                    onChange={setField('new_part_name')}
                                    style={{ marginTop: 4 }}
                                  />
                                  <p className="sub" style={{ margin: '4px 0 0' }}>
                                    Created in the master list and added to {entityName}&apos;s inventory when this request is approved.
                                  </p>
                                </>
                              )}

                              {mode === 'not_tracked' && (
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
                                    placeholder="Why isn't this tracked in inventory? (required)"
                                    value={line.not_tracked_reason}
                                    onChange={setField('not_tracked_reason')}
                                    style={{ marginTop: 4 }}
                                  />
                                  <p className="sub" style={{ margin: '4px 0 0' }}>
                                    Won&apos;t be counted toward inventory. The approver is shown this line and your reason.
                                  </p>
                                </>
                              )}

                              <input
                                type="text"
                                placeholder="Note (optional)"
                                value={line.description}
                                onChange={(e) => updatePoDraftLineField(i, 'description', e.target.value)}
                                style={{ marginTop: 4 }}
                              />
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
            <button className="btn-secondary" onClick={handleAddPurchaseRequestLine}>
              + Add Line
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
        </div>
      </div>

      {poView === 'my-invoices' ? (
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
            {poLoading ? '' : `(${visiblePurchaseRequests.length})`}
          </h2>
          <div className="header-actions">
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

        {poLoading ? (
          <div className="empty">Loading...</div>
        ) : visiblePurchaseRequests.length === 0 ? (
          <div className="empty">No purchase requests yet.</div>
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
                <col style={{ width: '190px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '85px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '75px' }} />
                <col style={{ width: '130px' }} />
                <col className="col-last" />
              </colgroup>
              <thead>
                <tr className="header-row">
                  <th className="row-head">ID</th>
                  <th>Description</th>
                  <th>Entity</th>
                  <th>Vendor</th>
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
                {visiblePurchaseRequests.map((r) => {
                  const next = nextStepInfo(r, users)
                  const busy = poActionBusyId === r.id
                  const workStatus = computeWorkStatus(r)
                  const paymentStatus = computePaymentStatus(r)
                  return (
                    <tr key={r.id}>
                      <td className="row-head">{r.id}</td>
                      <td className="nowrap-cell" title={r.description || undefined}>
                        {r.description ? truncate(r.description, PO_DESCRIPTION_MAX_LEN) : '—'}
                      </td>
                      <td className="nowrap-cell">{r.projects?.name || '—'}</td>
                      <td className="nowrap-cell">{r.vendors?.name || '—'}</td>
                      <td className="center-cell">
                        <PoProgressStepper request={r} />
                      </td>
                      <td className="center-cell">
                        {(r.status === 'issued' || r.status === 'closed') && (
                          <span className={`po-badge po-work-badge-${workStatus}`}>
                            {workStatusLabel(workStatus)}
                          </span>
                        )}
                      </td>
                      <td className="center-cell">
                        {(r.status === 'issued' || r.status === 'closed') && (
                          <span className={`po-badge po-payment-badge-${paymentStatus}`}>
                            {paymentStatusLabel(paymentStatus)}
                          </span>
                        )}
                      </td>
                      <td className="nowrap-cell">{findUserName(users, r.requested_by)}</td>
                      <td className="nowrap-cell">{next.who || '—'}</td>
                      <td className="nowrap-cell">{r.po_number || '—'}</td>
                      <td>
                        {r.status === 'draft' && canCreate && (
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
                        {r.status === 'issued' && canMatchInvoices(loggedInUser) && (
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
