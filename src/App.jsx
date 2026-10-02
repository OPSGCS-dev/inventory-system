import { useMemo, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'
import './App.css'
import {
  WHERE_USED_SEED,
  emptyFilters,
  blankDraftRow,
  uniqueSorted,
  shortProjectName,
  computeTargetSum,
  normalizeHeader,
  blankPurchaseRequestLine,
  isAdmin,
  isVendorUser,
  canEditInventory,
  canAccessTicketing,
  canCreatePurchaseRequests,
  canApproveRequests,
  canIssuePurchaseOrder,
  ENTITY_SCOPED_ROLES,
  linesAreMixedType,
  poLineType,
  categoryLineType,
  poCategory,
  canMarkPaymentPaid,
  userHasRole,
  PO_CATEGORY_LABELS,
  workStatusLabel,
  paymentStatusLabel,
  computeWorkStatus,
  computePaymentStatus,
  TICKETING_URL,
} from './utils'
import MasterListTab from './tabs/MasterListTab'
import RequiredInventoryTab from './tabs/RequiredInventoryTab'
import InventoryOnHandTab from './tabs/InventoryOnHandTab'
import PurchaseOrdersTab from './tabs/PurchaseOrdersTab'
import UsersTab from './tabs/UsersTab'
import GlobalSearch from './tabs/GlobalSearch'
import { matchPart } from './scrape/matchers'

function App() {
  const [authLoading, setAuthLoading] = useState(true)
  const [loggedInUser, setLoggedInUser] = useState(null)

  const [loginName, setLoginName] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginBusy, setLoginBusy] = useState(false)

  // Set after following an invite/recovery email link — Supabase has already
  // signed this browser in with a temporary session, but the person still
  // needs to choose their own password before using the app.
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false)
  const [passwordSetupValue, setPasswordSetupValue] = useState('')
  const [passwordSetupConfirm, setPasswordSetupConfirm] = useState('')
  const [passwordSetupError, setPasswordSetupError] = useState(null)
  const [passwordSetupBusy, setPasswordSetupBusy] = useState(false)

  // Self-service password change for anyone already logged in (e.g. to
  // replace a temporary password an admin created for them) -- separate
  // from the passwordSetup* state above, which only applies to the one-time
  // invite/recovery-link flow.
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [changePasswordValue, setChangePasswordValue] = useState('')
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('')
  const [changePasswordError, setChangePasswordError] = useState(null)
  const [changePasswordBusy, setChangePasswordBusy] = useState(false)

  const [activeTab, setActiveTab] = useState('master')

  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(emptyFilters)
  const [status, setStatus] = useState(null)

  const [editMode, setEditMode] = useState(false)
  const [draftParts, setDraftParts] = useState([])
  const [savingEdits, setSavingEdits] = useState(false)

  const [masterPanel, setMasterPanel] = useState(null) // null | 'import'
  const [importFileName, setImportFileName] = useState('')
  const [importPreview, setImportPreview] = useState(null)
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)

  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [projectItems, setProjectItems] = useState([])
  const [projectLoading, setProjectLoading] = useState(true)
  const [projectStatus, setProjectStatus] = useState(null)

  const [projectEditMode, setProjectEditMode] = useState(false)
  const [draftProjectItems, setDraftProjectItems] = useState([])
  const [savingProjectEdits, setSavingProjectEdits] = useState(false)
  const [projectEditFilter, setProjectEditFilter] = useState('')
  const [projectViewFilter, setProjectViewFilter] = useState('')

  const [stockItems, setStockItems] = useState([])
  const [stockLoading, setStockLoading] = useState(true)
  const [stockStatus, setStockStatus] = useState(null)
  const [stockViewProjectId, setStockViewProjectId] = useState('all')
  const [stockViewFilter, setStockViewFilter] = useState('')
  const [stockEditMode, setStockEditMode] = useState(false)
  const [draftStockItems, setDraftStockItems] = useState([])
  const [savingStockEdits, setSavingStockEdits] = useState(false)
  const [stockEditFilter, setStockEditFilter] = useState('')
  const [adjustNote, setAdjustNote] = useState('')

  const [stockPanel, setStockPanel] = useState(null) // null | 'upload' | 'history'

  const [locationEditMode, setLocationEditMode] = useState(false)
  const [draftLocationItems, setDraftLocationItems] = useState([])
  const [savingLocationEdits, setSavingLocationEdits] = useState(false)
  const [locationEditFilter, setLocationEditFilter] = useState('')
  const [locationNote, setLocationNote] = useState('')

  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadPreview, setUploadPreview] = useState(null)
  const [uploadErrors, setUploadErrors] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState('')

  const [recordUseMode, setRecordUseMode] = useState(false)
  const [useNote, setUseNote] = useState('')
  const [useQtyByPart, setUseQtyByPart] = useState({})
  const [savingUsePartId, setSavingUsePartId] = useState(null)

  const [transferMode, setTransferMode] = useState(false)
  const [transferToProjectId, setTransferToProjectId] = useState(null)
  const [transferNote, setTransferNote] = useState('')
  const [transferQtyByPart, setTransferQtyByPart] = useState({})
  const [savingTransferPartId, setSavingTransferPartId] = useState(null)

  const [journalEntries, setJournalEntries] = useState([])
  const [journalLoading, setJournalLoading] = useState(false)
  const [journalLines, setJournalLines] = useState({})
  const [expandedJournalId, setExpandedJournalId] = useState(null)

  // --- Purchase Orders ---
  const [users, setUsers] = useState([])
  // Rows from user_role_entities: which entities a user is scoped to for an
  // entity-scoped role (purchase_rec_approval / po_issue). A role holder
  // with no rows here is unscoped -- sees every entity.
  const [userRoleEntities, setUserRoleEntities] = useState([])
  const [vendors, setVendors] = useState([])
  const [purchaseRequests, setPurchaseRequests] = useState([])
  const [poLoading, setPoLoading] = useState(true)
  const [poStatus, setPoStatus] = useState(null)

  const [poStatusFilter, setPoStatusFilter] = useState('')
  const [poProjectFilter, setPoProjectFilter] = useState('')
  // 'all' | 'my-approvals' | 'my-invoices' -- persistent sub-tabs within the
  // Purchase Orders tab, same pattern as InventoryOnHandTab's stockPanel.
  const [poView, setPoView] = useState('all')
  const [expandedPoId, setExpandedPoId] = useState(null)
  const [poActivity, setPoActivity] = useState([])
  const [poActivityLoading, setPoActivityLoading] = useState(false)
  const [poActionBusyId, setPoActionBusyId] = useState(null)

  const [poFormOpen, setPoFormOpen] = useState(false)
  const [poDraftId, setPoDraftId] = useState(null)
  const [poDraftProjectId, setPoDraftProjectId] = useState(null)
  const [poDraftVendorId, setPoDraftVendorId] = useState(null)
  const [poDraftNotes, setPoDraftNotes] = useState('')
  const [poDraftDescription, setPoDraftDescription] = useState('')
  const [poDraftChargeableExpense, setPoDraftChargeableExpense] = useState(false)
  const [poDraftVendorQuoteNumber, setPoDraftVendorQuoteNumber] = useState('')
  const [poDraftQuoteFileUrl, setPoDraftQuoteFileUrl] = useState(null)
  const [poDraftQuoteFileName, setPoDraftQuoteFileName] = useState(null)
  const [poDraftNewQuoteFile, setPoDraftNewQuoteFile] = useState(null)
  // An invoice already in hand when the rec is made. Saved as a real row in
  // the invoices table (same as one added from the Invoices panel later), so
  // it needs all three of number/amount/file -- never stored on the request.
  const [poDraftInvoiceNumber, setPoDraftInvoiceNumber] = useState('')
  const [poDraftInvoiceAmount, setPoDraftInvoiceAmount] = useState('')
  const [poDraftNewInvoiceFile, setPoDraftNewInvoiceFile] = useState(null)
  const [poDraftCategory, setPoDraftCategory] = useState('purchase')
  const [poDraftMarkupRate, setPoDraftMarkupRate] = useState('10')
  const [poDraftTaxRate, setPoDraftTaxRate] = useState('13')
  const [poDraftShippingHandling, setPoDraftShippingHandling] = useState('0')
  const [poDraftCredit, setPoDraftCredit] = useState('0')
  const [poDraftNotToExceed, setPoDraftNotToExceed] = useState(false)
  const [poDraftSpendingCap, setPoDraftSpendingCap] = useState('')
  const [poDraftCurrency, setPoDraftCurrency] = useState('CAD')
  const [poDraftLines, setPoDraftLines] = useState([])
  const [savingPoRequest, setSavingPoRequest] = useState(false)
  const [poDraftEligiblePartIds, setPoDraftEligiblePartIds] = useState(new Set())
  const [poDraftFieldErrors, setPoDraftFieldErrors] = useState({})
  const [poDraftBudgetCategoryId, setPoDraftBudgetCategoryId] = useState(null)
  const [poDraftBudgetSubcategoryId, setPoDraftBudgetSubcategoryId] = useState(null)
  const [poDraftSubProjectId, setPoDraftSubProjectId] = useState(null)
  // Set only when this request was created via a ticket's "Create Purchase
  // Rec" button (or when re-opening a draft that already has one) -- no UI
  // ever sets these directly, they just ride along to the insert.
  const [poDraftTicketSystemTicketId, setPoDraftTicketSystemTicketId] = useState(null)
  const [poDraftTicketSystemTicketNumber, setPoDraftTicketSystemTicketNumber] = useState(null)

  const [budgetCategories, setBudgetCategories] = useState([])
  const [budgetSubcategories, setBudgetSubcategories] = useState([])
  const [draftBudgetCategories, setDraftBudgetCategories] = useState([])
  const [draftBudgetSubcategories, setDraftBudgetSubcategories] = useState([])
  const [savingBudgetCategories, setSavingBudgetCategories] = useState(false)
  const [savingBudgetSubcategories, setSavingBudgetSubcategories] = useState(false)

  // Individual sites within an Entity (e.g. Firelight Solar LP's 58 rooftop
  // projects) — only used to pin down which site a Purchase Request is for.
  // Spares inventory stays tracked at the Entity level, not per sub-project.
  const [subProjects, setSubProjects] = useState([])
  const [draftSubProjects, setDraftSubProjects] = useState([])
  const [savingSubProjects, setSavingSubProjects] = useState(false)

  const [adminImportPanelOpen, setAdminImportPanelOpen] = useState(false)
  const [adminImportFileName, setAdminImportFileName] = useState('')
  const [adminImportPreview, setAdminImportPreview] = useState(null)
  const [adminImportErrors, setAdminImportErrors] = useState([])
  const [adminImporting, setAdminImporting] = useState(false)

  const [issuingRequestId, setIssuingRequestId] = useState(null)
  const [pendingPoNumber, setPendingPoNumber] = useState(null)
  const [computingPoNumber, setComputingPoNumber] = useState(false)

  // --- Users tab (admin-only) ---
  const [usersStatus, setUsersStatus] = useState(null)
  const [draftUsers, setDraftUsers] = useState([])
  const [savingUsers, setSavingUsers] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoles, setInviteRoles] = useState([])
  const [inviting, setInviting] = useState(false)
  const [invitePassword, setInvitePassword] = useState(null)

  const [showVendorForm, setShowVendorForm] = useState(false)
  const [editingVendorId, setEditingVendorId] = useState(null)
  const [vendorFormName, setVendorFormName] = useState('')
  const [vendorFormContact, setVendorFormContact] = useState('')
  const [vendorFormPhone, setVendorFormPhone] = useState('')
  const [vendorFormEmail, setVendorFormEmail] = useState('')
  const [vendorFormAddress, setVendorFormAddress] = useState('')
  const [vendorFormNotes, setVendorFormNotes] = useState('')
  const [savingVendor, setSavingVendor] = useState(false)

  const [newProjectName, setNewProjectName] = useState('')
  const [addingProject, setAddingProject] = useState(false)

  async function loadParts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('parts')
      .select('*')
      .order('gcs_id', { ascending: true })

    if (error) {
      console.error(error)
      setStatus({ ok: false, msg: 'Could not load parts — check the console for details.' })
    } else {
      setParts(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (loggedInUser) loadParts()
  }, [loggedInUser])

  async function loadProjects() {
    const { data, error } = await supabase.from('projects').select('*').order('name', { ascending: true })
    if (error) {
      console.error(error)
      setProjectStatus({ ok: false, msg: 'Could not load entities — check the console for details.' })
      return
    }
    setProjects(data ?? [])
    if (data && data.length > 0 && selectedProjectId === null) {
      setSelectedProjectId(data[0].id)
    } else if (!data || data.length === 0) {
      setProjectLoading(false)
    }
  }

  async function loadSubProjects() {
    const { data, error } = await supabase.from('sub_projects').select('*').order('id', { ascending: true })
    if (error) {
      console.error(error)
      return
    }
    setSubProjects(data ?? [])
  }

  async function loadProjectItems(projectId) {
    if (!projectId) {
      setProjectItems([])
      return
    }
    setProjectLoading(true)
    const { data, error } = await supabase
      .from('project_parts')
      .select('*, parts(*)')
      .eq('project_id', projectId)

    if (error) {
      console.error(error)
      setProjectStatus({ ok: false, msg: 'Could not load entity sheet — check the console for details.' })
    } else {
      const sorted = (data ?? []).slice().sort((a, b) => (a.parts?.gcs_id ?? 0) - (b.parts?.gcs_id ?? 0))
      setProjectItems(sorted)
    }
    setProjectLoading(false)
  }

  useEffect(() => {
    if (loggedInUser) loadProjects()
  }, [loggedInUser])

  useEffect(() => {
    if (loggedInUser && selectedProjectId) loadProjectItems(selectedProjectId)
  }, [loggedInUser, selectedProjectId])

  // A purchase request's part picker should only offer spares that are
  // actually stocked for that site — not the entire company-wide parts list.
  useEffect(() => {
    let cancelled = false
    async function loadEligiblePartIds() {
      if (!poDraftProjectId) {
        setPoDraftEligiblePartIds(new Set())
        return
      }
      const { data, error } = await supabase
        .from('project_parts')
        .select('part_gcs_id')
        .eq('project_id', poDraftProjectId)
      if (cancelled) return
      if (error) {
        console.error(error)
        setPoDraftEligiblePartIds(new Set())
      } else {
        setPoDraftEligiblePartIds(new Set((data ?? []).map((r) => r.part_gcs_id)))
      }
    }
    loadEligiblePartIds()
    return () => {
      cancelled = true
    }
  }, [poDraftProjectId])

  async function loadStock() {
    setStockLoading(true)
    const [ppRes, sohRes] = await Promise.all([
      supabase.from('project_parts').select('project_id, part_gcs_id, target_stock, shared'),
      supabase.from('stock_on_hand').select('project_id, part_gcs_id, quantity'),
    ])

    if (ppRes.error || sohRes.error) {
      console.error(ppRes.error || sohRes.error)
      setStockStatus({ ok: false, msg: 'Could not load inventory — check the console for details.' })
      setStockLoading(false)
      return
    }

    const sohMap = new Map(
      (sohRes.data ?? []).map((s) => [`${s.project_id}:${s.part_gcs_id}`, s])
    )

    const byPart = new Map()
    for (const row of ppRes.data ?? []) {
      if (!byPart.has(row.part_gcs_id)) {
        byPart.set(row.part_gcs_id, { gcs_id: row.part_gcs_id, perProject: {} })
      }
      const soh = sohMap.get(`${row.project_id}:${row.part_gcs_id}`)
      byPart.get(row.part_gcs_id).perProject[row.project_id] = {
        target: row.target_stock,
        shared: Boolean(row.shared),
        onHand: soh?.quantity ?? 0,
      }
    }

    const items = [...byPart.values()]
      .map((entry) => {
        const values = Object.values(entry.perProject)
        const part = parts.find((p) => p.gcs_id === entry.gcs_id)
        const onHandSum = values.reduce((sum, p) => sum + (p.onHand ?? 0), 0)
        const storageQty = part?.storage_qty ?? 0
        const barnQty = part?.barn_qty ?? 0
        return {
          gcs_id: entry.gcs_id,
          part,
          perProject: entry.perProject,
          targetSum: computeTargetSum(values),
          onHandSum,
          storageQty,
          barnQty,
          projectQty: onHandSum - storageQty - barnQty,
        }
      })
      .sort((a, b) => a.gcs_id - b.gcs_id)

    setStockItems(items)
    setStockLoading(false)
  }

  useEffect(() => {
    if (loggedInUser && parts.length > 0) loadStock()
  }, [loggedInUser, parts])

  async function loadUsers() {
    const { data, error } = await supabase.from('users').select('*').order('name', { ascending: true })
    if (error) {
      console.error(error)
      flashPoStatus('Could not load people — check the console for details.', false)
      return
    }
    setUsers(data ?? [])
  }

  async function loadUserRoleEntities() {
    const { data, error } = await supabase.from('user_role_entities').select('*')
    if (error) {
      console.error(error)
      return
    }
    setUserRoleEntities(data ?? [])
  }

  // The Admin tab's Users table is always directly editable (it's already
  // gated to admins only) — this keeps the on-screen draft in sync with
  // whatever was last loaded from the server, so edits start from a clean
  // baseline after every save/reload. Vendor-logon accounts (vendor_id set)
  // are managed from the Vendors table instead, so they're excluded here.
  // A newly-created account is fully real and usable right away (it gets a
  // real, working temporary password up front -- see api/invite-user.js),
  // so unlike the old link-based invite there's no non-functional limbo
  // state to hide; activated_at just flags whether they're still on that
  // temporary password (see the "Temp password" note next to their email).
  useEffect(() => {
    setDraftUsers(
      users
        .filter((u) => !u.vendor_id)
        .map((u) => {
          const entityAssignments = {}
          for (const role of ENTITY_SCOPED_ROLES) {
            entityAssignments[role] = userRoleEntities
              .filter((row) => row.user_id === u.id && row.role === role)
              .map((row) => row.project_id)
          }
          return { ...u, _existing: true, entityAssignments }
        })
    )
  }, [users, userRoleEntities])

  function updateDraftUserEntityAssignment(index, role, projectIds) {
    setDraftUsers((prev) =>
      prev.map((u, i) =>
        i === index ? { ...u, entityAssignments: { ...u.entityAssignments, [role]: projectIds } } : u
      )
    )
  }

  async function loadVendors() {
    const { data, error } = await supabase.from('vendors').select('*').order('name', { ascending: true })
    if (error) {
      console.error(error)
      flashPoStatus('Could not load vendors — check the console for details.', false)
      return
    }
    setVendors(data ?? [])
  }

  async function loadBudgetCategories() {
    const { data, error } = await supabase.from('budget_categories').select('*').order('id', { ascending: true })
    if (error) {
      console.error(error)
      flashPoStatus('Could not load budget categories — check the console for details.', false)
      return
    }
    setBudgetCategories(data ?? [])
  }

  async function loadBudgetSubcategories() {
    const { data, error } = await supabase
      .from('budget_subcategories')
      .select('*')
      .order('id', { ascending: true })
    if (error) {
      console.error(error)
      flashPoStatus('Could not load budget sub-categories — check the console for details.', false)
      return
    }
    setBudgetSubcategories(data ?? [])
  }

  useEffect(() => {
    setDraftBudgetCategories(budgetCategories.map((c) => ({ ...c, _existing: true })))
  }, [budgetCategories])

  useEffect(() => {
    setDraftBudgetSubcategories(budgetSubcategories.map((c) => ({ ...c, _existing: true })))
  }, [budgetSubcategories])

  useEffect(() => {
    setDraftSubProjects(subProjects.map((sp) => ({ ...sp, _existing: true })))
  }, [subProjects])

  const PURCHASE_REQUEST_SELECT =
    '*, purchase_request_lines(*, parts(*)), projects(*), sub_projects(*), vendors(*), budget_categories(*), budget_subcategories(*), invoices(*), receipts(*)'

  async function loadPurchaseRequests() {
    setPoLoading(true)
    const { data, error } = await supabase
      .from('purchase_requests')
      .select(PURCHASE_REQUEST_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      flashPoStatus('Could not load purchase requests — check the console for details.', false)
      setPoLoading(false)
      return
    }
    setPurchaseRequests(data ?? [])
    setPoLoading(false)
  }

  // Re-fetches just the one request an action touched (with the same deep
  // joins the full list uses) and splices it back into local state, instead
  // of reloading every purchase request's whole join tree after every
  // single action -- that full reload is what loadPurchaseRequests above
  // is for (initial load only now). Upserts by id so it also works right
  // after inserting a brand-new draft, which isn't in state yet.
  async function refreshPurchaseRequest(requestId) {
    const { data, error } = await supabase
      .from('purchase_requests')
      .select(PURCHASE_REQUEST_SELECT)
      .eq('id', requestId)
      .single()
    if (error) {
      console.error(error)
      flashPoStatus('Saved, but could not refresh this request — check the console for details.', false)
      return
    }
    setPurchaseRequests((prev) =>
      prev.some((r) => r.id === requestId) ? prev.map((r) => (r.id === requestId ? data : r)) : [data, ...prev]
    )
  }

  // Compact, append-only activity log for a PO -- loaded lazily (only when
  // its detail view is actually opened) rather than joined into the main
  // list query, so it doesn't add weight to every single PO action.
  async function loadPoActivity(requestId) {
    setPoActivityLoading(true)
    const { data, error } = await supabase
      .from('purchase_request_activity')
      .select('id, note, created_at, user_id')
      .eq('purchase_request_id', requestId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error(error)
      setPoActivity([])
      setPoActivityLoading(false)
      return
    }
    setPoActivity(data ?? [])
    setPoActivityLoading(false)
  }

  // A logging failure should never block or surface an error for the
  // actual action the user asked for -- swallowed and console-logged only.
  // Also refreshes the loaded activity list, so an already-open detail
  // view reflects the new entry immediately.
  async function logPoActivity(requestId, note) {
    if (!loggedInUser) return
    try {
      await supabase.from('purchase_request_activity').insert({
        purchase_request_id: requestId,
        user_id: loggedInUser.id,
        note,
      })
      await loadPoActivity(requestId)
    } catch (error) {
      console.error('Could not log PO activity:', error)
    }
  }

  useEffect(() => {
    if (loggedInUser) {
      loadUsers()
      loadUserRoleEntities()
      loadVendors()
      loadPurchaseRequests()
      loadBudgetCategories()
      loadBudgetSubcategories()
      loadSubProjects()
    }
  }, [loggedInUser])

  // Loads (or reloads, after sign-in/out) the `users` row that matches the
  // current Supabase Auth session, which is what the rest of this app
  // actually reads as "the logged-in user" (id, roles, vendor_id, etc.).
  async function loadUserForSession(session) {
    if (!session?.user) {
      setLoggedInUser(null)
      return
    }
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()
    if (error || !data || !data.active) {
      setLoggedInUser(null)
      return
    }
    setLoggedInUser(data)
  }

  // On mount: an invite/recovery email link lands back here with Supabase
  // already having parsed a temporary session out of the URL — in that case
  // show a "set your password" screen instead of the normal app. Otherwise,
  // just restore whatever session Supabase already has persisted.
  useEffect(() => {
    if (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery')) {
      setNeedsPasswordSetup(true)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadUserForSession(session).finally(() => setAuthLoading(false))
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordSetup(true)
      }
      loadUserForSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setLoginError(null)
    const email = loginName.trim()
    if (!email || !loginPassword) {
      setLoginError('Email and password are required.')
      return
    }
    setLoginBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: loginPassword })
      if (error) throw error
      setLoginName('')
      setLoginPassword('')
    } catch (error) {
      console.error(error)
      setLoginError('Incorrect email or password.')
    } finally {
      setLoginBusy(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setLoggedInUser(null)
  }

  async function handlePasswordSetup(e) {
    e.preventDefault()
    setPasswordSetupError(null)
    if (!passwordSetupValue || passwordSetupValue.length < 8) {
      setPasswordSetupError('Password must be at least 8 characters.')
      return
    }
    if (passwordSetupValue !== passwordSetupConfirm) {
      setPasswordSetupError('Passwords do not match.')
      return
    }
    setPasswordSetupBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordSetupValue })
      if (error) throw error
      setNeedsPasswordSetup(false)
      setPasswordSetupValue('')
      setPasswordSetupConfirm('')
      // Clear the invite/recovery token out of the URL now that it's used.
      window.history.replaceState(null, '', window.location.pathname)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // A brand-new invite starts active:false, activated_at:null (see
        // api/invite-user.js) precisely so it can't be mistaken for a real
        // account until this point -- actually completing password setup.
        await supabase
          .from('users')
          .update({ active: true, activated_at: new Date().toISOString() })
          .eq('auth_user_id', session.user.id)
      }
      await loadUserForSession(session)
    } catch (error) {
      console.error(error)
      setPasswordSetupError('Could not set password — check the console for details.')
    } finally {
      setPasswordSetupBusy(false)
    }
  }

  // Lets anyone already logged in replace their own password at any time --
  // in particular, an admin-created temporary one -- without needing a
  // link at all.
  async function handleChangePassword(e) {
    e.preventDefault()
    setChangePasswordError(null)
    if (!changePasswordValue || changePasswordValue.length < 8) {
      setChangePasswordError('Password must be at least 8 characters.')
      return
    }
    if (changePasswordValue !== changePasswordConfirm) {
      setChangePasswordError('Passwords do not match.')
      return
    }
    setChangePasswordBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: changePasswordValue })
      if (error) throw error
      if (loggedInUser?.id) {
        await supabase
          .from('users')
          .update({ activated_at: new Date().toISOString() })
          .eq('id', loggedInUser.id)
        setLoggedInUser((prev) => (prev ? { ...prev, activated_at: new Date().toISOString() } : prev))
      }
      setShowChangePassword(false)
      setChangePasswordValue('')
      setChangePasswordConfirm('')
    } catch (error) {
      console.error(error)
      setChangePasswordError('Could not change password — check the console for details.')
    } finally {
      setChangePasswordBusy(false)
    }
  }

  function flashStatus(msg, ok) {
    setStatus({ ok, msg })
    setTimeout(() => setStatus(null), 3000)
  }

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const hasActiveFilter = Object.values(filters).some(Boolean)

  const lastPartsUpdate = parts.reduce(
    (latest, p) => (p.updated_at && (!latest || p.updated_at > latest) ? p.updated_at : latest),
    null
  )

  const manufacturerOptions = useMemo(
    () => uniqueSorted([...parts.map((p) => p.manufacturer), ...draftParts.map((r) => r.manufacturer)]),
    [parts, draftParts]
  )
  const categoryOptions = useMemo(
    () => uniqueSorted([...parts.map((p) => p.spare_category), ...draftParts.map((r) => r.spare_category)]),
    [parts, draftParts]
  )
  const whereUsedOptions = useMemo(
    () =>
      uniqueSorted([
        ...WHERE_USED_SEED,
        ...parts.map((p) => p.where_used),
        ...draftParts.map((r) => r.where_used),
      ]),
    [parts, draftParts]
  )

  function runAction(action) {
    if (action.type === 'edit') {
      setDraftParts(parts.map((p) => ({ ...p, _existing: true })))
      setFilters(emptyFilters)
      setEditMode(true)
    }
    if (action.type === 'export-parts') {
      handleExportParts()
    }
    if (action.type === 'import-parts') {
      setImportFileName('')
      setImportPreview(null)
      setImportErrors([])
      setMasterPanel('import')
    }
    if (action.type === 'project-edit') {
      const byGcsId = new Map(projectItems.map((item) => [item.part_gcs_id, item]))
      const draft = parts
        .slice()
        .sort((a, b) => a.gcs_id - b.gcs_id)
        .map((part) => {
          const existing = byGcsId.get(part.gcs_id)
          return {
            gcs_id: part.gcs_id,
            part,
            project_part_id: existing ? existing.id : null,
            required: Boolean(existing),
            target_stock: existing?.target_stock ?? '',
            shared: Boolean(existing?.shared),
          }
        })
      setDraftProjectItems(draft)
      setProjectEditFilter('')
      setProjectEditMode(true)
    }
    if (action.type === 'stock-edit') {
      const draft = stockItems.map((item) => ({
        gcs_id: item.gcs_id,
        part: item.part,
        perProject: item.perProject,
        qtyByProject: Object.fromEntries(
          Object.entries(item.perProject).map(([pid, p]) => [pid, String(p.onHand ?? 0)])
        ),
      }))
      setDraftStockItems(draft)
      setStockEditFilter('')
      setAdjustNote('')
      setStockEditMode(true)
    }
    if (action.type === 'location-edit') {
      const draft = stockItems.map((item) => ({
        gcs_id: item.gcs_id,
        part: item.part,
        perProject: item.perProject,
        onHandSum: item.onHandSum,
        storage_qty: String(item.storageQty ?? 0),
        barn_qty: String(item.barnQty ?? 0),
      }))
      setDraftLocationItems(draft)
      setLocationEditFilter('')
      setLocationNote('')
      setLocationEditMode(true)
    }
    if (action.type === 'record-use') {
      startRecordPartUse()
    }
    if (action.type === 'stock-transfer') {
      startStockTransfer()
    }
  }

  function updateDraftField(index, field, value) {
    setDraftParts((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function addDraftRow() {
    setDraftParts((prev) => [...prev, blankDraftRow()])
  }

  function removeDraftRow(index) {
    setDraftParts((prev) => prev.filter((_, i) => i !== index))
  }

  function handleCancelEdits() {
    setEditMode(false)
    setDraftParts([])
  }

  async function handleSaveEdits() {
    const newRows = draftParts.filter((r) => !r._existing)
    for (const row of newRows) {
      if (!(row.gcs_part_id || '').trim()) {
        flashStatus('Every new row needs a Part ID.', false)
        return
      }
    }

    setSavingEdits(true)
    try {
      const originalIds = parts.map((p) => p.gcs_id)
      const draftExistingIds = draftParts.filter((r) => r._existing).map((r) => r.gcs_id)
      const deletedIds = originalIds.filter((id) => !draftExistingIds.includes(id))

      const editableFields = ['description', 'manufacturer', 'spare_category', 'where_used']
      const changedRows = draftParts.filter((r) => {
        if (!r._existing) return false
        const orig = parts.find((p) => p.gcs_id === r.gcs_id)
        if (!orig) return false
        if (editableFields.some((field) => (orig[field] || '') !== (r[field] || ''))) return true
        return (orig.last_cost ?? '') !== (r.last_cost === '' ? '' : Number(r.last_cost))
      })

      if (deletedIds.length) {
        const { error } = await supabase.from('parts').delete().in('gcs_id', deletedIds)
        if (error) throw error
      }

      for (const row of changedRows) {
        const { error } = await supabase
          .from('parts')
          .update({
            description: (row.description || '').trim() || null,
            manufacturer: (row.manufacturer || '').trim() || null,
            spare_category: (row.spare_category || '').trim() || null,
            where_used: (row.where_used || '').trim() || null,
            last_cost: row.last_cost === '' ? null : Number(row.last_cost),
            updated_at: new Date().toISOString(),
          })
          .eq('gcs_id', row.gcs_id)
        if (error) throw error
      }

      if (newRows.length) {
        const { error } = await supabase.from('parts').insert(
          newRows.map((r) => ({
            gcs_part_id: r.gcs_part_id.trim(),
            manufacturer_part_number: (r.manufacturer_part_number || '').trim() || null,
            manufacturer: (r.manufacturer || '').trim() || null,
            spare_category: (r.spare_category || '').trim() || null,
            where_used: (r.where_used || '').trim() || null,
            description: (r.description || '').trim() || null,
            last_cost: r.last_cost === '' ? null : Number(r.last_cost),
            updated_at: new Date().toISOString(),
          }))
        )
        if (error) throw error
      }

      setEditMode(false)
      setDraftParts([])
      flashStatus('Changes saved.', true)
      await loadParts()
    } catch (error) {
      console.error(error)
      flashStatus('Could not save changes — check the console for details.', false)
    } finally {
      setSavingEdits(false)
    }
  }

  function handleExportParts() {
    const rows = parts.map((p) => ({
      'GCS P/N': p.gcs_id,
      'Part ID': p.gcs_part_id || '',
      'Mfr Part #': p.manufacturer_part_number || '',
      Manufacturer: p.manufacturer || '',
      Category: p.spare_category || '',
      'Where Used': p.where_used || '',
      Description: p.description || '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `parts-master-list-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const ADMIN_SHEET_NAMES = [
    'Users',
    'Vendors',
    'Entities',
    'Projects',
    'Budget Categories',
    'Budget Sub-Categories',
  ]

  function handleExportAdminData() {
    const wb = XLSX.utils.book_new()

    // Passwords are never included in the export — a new user row imported
    // from this file will need a Password filled in by hand before import.
    const userRows = users.map((u) => ({
      Name: u.name,
      Admin: u.roles?.includes('admin') ? 'Yes' : '',
      Inventory: u.roles?.includes('inventory') ? 'Yes' : '',
      Ticketing: u.roles?.includes('ticketing') ? 'Yes' : '',
      'Purchase Rec': u.roles?.includes('purchase_req') ? 'Yes' : '',
      'Purchase Rec Approval': u.roles?.includes('purchase_rec_approval') ? 'Yes' : '',
      'PO Issue': u.roles?.includes('po_issue') ? 'Yes' : '',
      'Invoice Matching': u.roles?.includes('invoice_matching') ? 'Yes' : '',
      'Invoice Approval': u.roles?.includes('invoice_approval') ? 'Yes' : '',
      Payment: u.roles?.includes('payment') ? 'Yes' : '',
      Active: u.active ? 'Yes' : 'No',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userRows), 'Users')

    const vendorRows = vendors.map((v) => ({
      Name: v.name,
      Contact: v.contact_name || '',
      Phone: v.phone || '',
      Email: v.email || '',
      Address: v.address || '',
      Notes: v.notes || '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vendorRows), 'Vendors')

    const projectRows = projects.map((p) => ({ Name: p.name, 'PO Code': p.project_code || '' }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows), 'Entities')

    const subProjectRows = subProjects.map((sp) => ({
      Entity: projects.find((p) => p.id === sp.project_id)?.name || '',
      Name: sp.name,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subProjectRows), 'Projects')

    const categoryRows = budgetCategories.map((c) => ({ Name: c.name }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categoryRows), 'Budget Categories')

    const subcategoryRows = budgetSubcategories.map((sc) => ({
      'Budget Category': budgetCategories.find((c) => c.id === sc.category_id)?.name || '',
      Name: sc.name,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subcategoryRows), 'Budget Sub-Categories')

    XLSX.writeFile(wb, `admin-data-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function truthyCsvFlag(val) {
    const v = String(val ?? '').trim().toLowerCase()
    return v !== '' && v !== 'no' && v !== 'false' && v !== '0'
  }

  // Sheet rows come back keyed by their exact header text — this looks a
  // field up case-insensitively so a manually re-typed header still matches.
  function getCell(row, name) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === name.toLowerCase())
    return key ? row[key] : undefined
  }

  async function handleAdminImportFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAdminImportFileName(file.name)
    setAdminImportPreview(null)
    setAdminImportErrors([])

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })

    if (!wb.SheetNames.some((n) => ADMIN_SHEET_NAMES.includes(n))) {
      setAdminImportErrors([
        `No recognized sheet names found — expected one or more of: ${ADMIN_SHEET_NAMES.join(', ')}.`,
      ])
      return
    }

    function sheetRows(sheetName) {
      const ws = wb.Sheets[sheetName]
      return ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : []
    }

    const errors = []
    const rows = []
    const seenCategoryNames = new Set(budgetCategories.map((c) => c.name.toLowerCase()))
    const seenEntityNames = new Set(projects.map((p) => p.name.toLowerCase()))

    sheetRows('Users').forEach((row, i) => {
      const rowNum = i + 2
      const name = String(getCell(row, 'Name') || '').trim()
      if (!name) return
      const existing = users.find((u) => u.name.toLowerCase() === name.toLowerCase())
      if (!existing) {
        errors.push(`Users row ${rowNum}: "${name}" doesn't match an existing user — add new users via the Invite form instead, then re-import to set their roles.`)
        return
      }
      const roles = []
      if (truthyCsvFlag(getCell(row, 'Admin'))) roles.push('admin')
      if (truthyCsvFlag(getCell(row, 'Inventory'))) roles.push('inventory')
      if (truthyCsvFlag(getCell(row, 'Ticketing'))) roles.push('ticketing')
      if (truthyCsvFlag(getCell(row, 'Purchase Rec'))) roles.push('purchase_req')
      if (truthyCsvFlag(getCell(row, 'Purchase Rec Approval'))) roles.push('purchase_rec_approval')
      if (truthyCsvFlag(getCell(row, 'PO Issue'))) roles.push('po_issue')
      if (truthyCsvFlag(getCell(row, 'Invoice Matching'))) roles.push('invoice_matching')
      if (truthyCsvFlag(getCell(row, 'Invoice Approval'))) roles.push('invoice_approval')
      if (truthyCsvFlag(getCell(row, 'Payment'))) roles.push('payment')
      const activeCell = getCell(row, 'Active')
      const active = activeCell !== undefined ? truthyCsvFlag(activeCell) : true
      rows.push({
        section: 'User',
        name,
        action: 'update',
        existingId: existing.id,
        data: { roles, active },
      })
    })

    sheetRows('Vendors').forEach((row) => {
      const name = String(getCell(row, 'Name') || '').trim()
      if (!name) return
      const existing = vendors.find((v) => v.name.toLowerCase() === name.toLowerCase())
      rows.push({
        section: 'Vendor',
        name,
        action: existing ? 'update' : 'insert',
        existingId: existing?.id ?? null,
        data: {
          name,
          contact_name: String(getCell(row, 'Contact') || '').trim() || null,
          phone: String(getCell(row, 'Phone') || '').trim() || null,
          email: String(getCell(row, 'Email') || '').trim() || null,
          address: String(getCell(row, 'Address') || '').trim() || null,
          notes: String(getCell(row, 'Notes') || '').trim() || null,
        },
      })
    })

    sheetRows('Entities').forEach((row) => {
      const name = String(getCell(row, 'Name') || '').trim()
      if (!name) return
      const existing = projects.find((p) => p.name.toLowerCase() === name.toLowerCase())
      if (!existing) seenEntityNames.add(name.toLowerCase())
      rows.push({
        section: 'Entity',
        name,
        action: existing ? 'update' : 'insert',
        existingId: existing?.id ?? null,
        data: { name, project_code: String(getCell(row, 'PO Code') || '').trim() || null },
      })
    })

    sheetRows('Projects').forEach((row, i) => {
      const rowNum = i + 2
      const name = String(getCell(row, 'Name') || '').trim()
      if (!name) return
      const entityName = String(getCell(row, 'Entity') || '').trim()
      if (!entityName) {
        errors.push(`Projects row ${rowNum}: "${name}" needs an Entity.`)
        return
      }
      if (!seenEntityNames.has(entityName.toLowerCase())) {
        errors.push(`Projects row ${rowNum}: Entity "${entityName}" not found for project "${name}".`)
        return
      }
      const existing = subProjects.find(
        (sp) =>
          sp.name.toLowerCase() === name.toLowerCase() &&
          projects.find((p) => p.id === sp.project_id)?.name.toLowerCase() === entityName.toLowerCase()
      )
      rows.push({
        section: 'Project',
        name,
        action: existing ? 'update' : 'insert',
        existingId: existing?.id ?? null,
        data: { name, entityName },
      })
    })

    sheetRows('Budget Categories').forEach((row) => {
      const name = String(getCell(row, 'Name') || '').trim()
      if (!name) return
      const existing = budgetCategories.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (!existing) seenCategoryNames.add(name.toLowerCase())
      rows.push({
        section: 'Budget Category',
        name,
        action: existing ? 'update' : 'insert',
        existingId: existing?.id ?? null,
        data: { name },
      })
    })

    sheetRows('Budget Sub-Categories').forEach((row, i) => {
      const rowNum = i + 2
      const name = String(getCell(row, 'Name') || '').trim()
      if (!name) return
      const categoryName = String(getCell(row, 'Budget Category') || '').trim()
      if (!categoryName) {
        errors.push(`Budget Sub-Categories row ${rowNum}: "${name}" needs a Budget Category.`)
        return
      }
      if (!seenCategoryNames.has(categoryName.toLowerCase())) {
        errors.push(
          `Budget Sub-Categories row ${rowNum}: Budget Category "${categoryName}" not found for sub-category "${name}".`
        )
        return
      }
      const existing = budgetSubcategories.find(
        (sc) =>
          sc.name.toLowerCase() === name.toLowerCase() &&
          budgetCategories.find((c) => c.id === sc.category_id)?.name.toLowerCase() ===
            categoryName.toLowerCase()
      )
      rows.push({
        section: 'Budget Sub-Category',
        name,
        action: existing ? 'update' : 'insert',
        existingId: existing?.id ?? null,
        data: { name, categoryName },
      })
    })

    setAdminImportErrors(errors)
    setAdminImportPreview(rows.length ? { rows } : null)
  }

  async function handleConfirmAdminImport() {
    if (!adminImportPreview || adminImportPreview.rows.length === 0) return
    setAdminImporting(true)
    try {
      const byType = (section) => adminImportPreview.rows.filter((r) => r.section === section)

      for (const row of byType('User')) {
        const { error } = await supabase
          .from('users')
          .update({ roles: row.data.roles, active: row.data.active })
          .eq('id', row.existingId)
        if (error) throw error
      }

      for (const row of byType('Vendor')) {
        if (row.action === 'update') {
          const { error } = await supabase.from('vendors').update(row.data).eq('id', row.existingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('vendors').insert(row.data)
          if (error) throw error
        }
      }

      const entityNameToId = new Map(projects.map((p) => [p.name.toLowerCase(), p.id]))
      for (const row of byType('Entity')) {
        if (row.action === 'update') {
          const { error } = await supabase
            .from('projects')
            .update({ project_code: row.data.project_code })
            .eq('id', row.existingId)
          if (error) throw error
          entityNameToId.set(row.name.toLowerCase(), row.existingId)
        } else {
          const { data, error } = await supabase
            .from('projects')
            .insert({ name: row.data.name })
            .select()
            .single()
          if (error) throw error
          entityNameToId.set(row.data.name.toLowerCase(), data.id)
        }
      }

      for (const row of byType('Project')) {
        const entityId = entityNameToId.get(row.data.entityName.toLowerCase())
        if (row.action === 'update') {
          const { error } = await supabase
            .from('sub_projects')
            .update({ name: row.data.name, project_id: entityId })
            .eq('id', row.existingId)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('sub_projects')
            .insert({ name: row.data.name, project_id: entityId })
          if (error) throw error
        }
      }

      const categoryNameToId = new Map(budgetCategories.map((c) => [c.name.toLowerCase(), c.id]))
      for (const row of byType('Budget Category')) {
        if (row.action === 'update') {
          categoryNameToId.set(row.name.toLowerCase(), row.existingId)
        } else {
          const { data, error } = await supabase
            .from('budget_categories')
            .insert({ name: row.data.name })
            .select()
            .single()
          if (error) throw error
          categoryNameToId.set(row.data.name.toLowerCase(), data.id)
        }
      }

      for (const row of byType('Budget Sub-Category')) {
        const categoryId = categoryNameToId.get(row.data.categoryName.toLowerCase())
        if (row.action === 'update') {
          const { error } = await supabase
            .from('budget_subcategories')
            .update({ name: row.data.name, category_id: categoryId })
            .eq('id', row.existingId)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('budget_subcategories')
            .insert({ name: row.data.name, category_id: categoryId })
          if (error) throw error
        }
      }

      resetAdminImportPanel()
      flashUsersStatus(`Imported ${adminImportPreview.rows.length} rows.`, true)
      await Promise.all([
        loadUsers(),
        loadVendors(),
        loadProjects(),
        loadSubProjects(),
        loadBudgetCategories(),
        loadBudgetSubcategories(),
      ])
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not import — check the console for details.', false)
    } finally {
      setAdminImporting(false)
    }
  }

  function resetAdminImportPanel() {
    setAdminImportPanelOpen(false)
    setAdminImportFileName('')
    setAdminImportPreview(null)
    setAdminImportErrors([])
  }

  function resetMasterPanel() {
    setMasterPanel(null)
    setImportFileName('')
    setImportPreview(null)
    setImportErrors([])
  }

  async function handleImportFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFileName(file.name)
    setImportPreview(null)
    setImportErrors([])

    const text = await file.text()
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })

    const fields = parsed.meta.fields || []
    const fieldMap = {}
    for (const f of fields) fieldMap[normalizeHeader(f)] = f

    const gcsKey = fieldMap['gcspn'] || fieldMap['gcsid'] || fieldMap['gcs']
    const partIdKey = fieldMap['partid']
    const mfrPartKey = fieldMap['mfrpart'] || fieldMap['mfrpartno'] || fieldMap['manufacturerpartnumber']
    const mfrKey = fieldMap['manufacturer']
    const categoryKey = fieldMap['category'] || fieldMap['sparecategory']
    const whereUsedKey = fieldMap['whereused']
    const descKey = fieldMap['description']

    if (!partIdKey) {
      setImportErrors(['CSV must have a "Part ID" column.'])
      return
    }

    const errors = []
    const rows = []
    parsed.data.forEach((row, i) => {
      const rowNum = i + 2
      const gcsRaw = gcsKey ? (row[gcsKey] || '').trim() : ''
      const partId = (row[partIdKey] || '').trim()
      if (!partId) {
        errors.push(`Row ${rowNum}: Part ID is required.`)
        return
      }
      let existing = null
      if (gcsRaw) {
        const gcsId = parseInt(gcsRaw, 10)
        existing = parts.find((p) => p.gcs_id === gcsId)
        if (!existing) {
          errors.push(`Row ${rowNum}: GCS P/N "${gcsRaw}" not found — leave GCS P/N blank to add a new part.`)
          return
        }
      }
      rows.push({
        gcs_id: existing?.gcs_id ?? null,
        action: existing ? 'update' : 'insert',
        gcs_part_id: partId,
        manufacturer_part_number: mfrPartKey ? (row[mfrPartKey] || '').trim() : '',
        manufacturer: mfrKey ? (row[mfrKey] || '').trim() : '',
        spare_category: categoryKey ? (row[categoryKey] || '').trim() : '',
        where_used: whereUsedKey ? (row[whereUsedKey] || '').trim() : '',
        description: descKey ? (row[descKey] || '').trim() : '',
      })
    })

    setImportErrors(errors)
    setImportPreview(rows.length ? { rows } : null)
  }

  async function handleConfirmImport() {
    if (!importPreview || importPreview.rows.length === 0) return
    setImporting(true)
    try {
      const updates = importPreview.rows.filter((r) => r.action === 'update')
      const inserts = importPreview.rows.filter((r) => r.action === 'insert')
      const nowIso = new Date().toISOString()

      for (const row of updates) {
        const { error } = await supabase
          .from('parts')
          .update({
            gcs_part_id: row.gcs_part_id,
            manufacturer_part_number: row.manufacturer_part_number || null,
            manufacturer: row.manufacturer || null,
            spare_category: row.spare_category || null,
            where_used: row.where_used || null,
            description: row.description || null,
            updated_at: nowIso,
          })
          .eq('gcs_id', row.gcs_id)
        if (error) throw error
      }

      if (inserts.length) {
        const { error } = await supabase.from('parts').insert(
          inserts.map((r) => ({
            gcs_part_id: r.gcs_part_id,
            manufacturer_part_number: r.manufacturer_part_number || null,
            manufacturer: r.manufacturer || null,
            spare_category: r.spare_category || null,
            where_used: r.where_used || null,
            description: r.description || null,
            updated_at: nowIso,
          }))
        )
        if (error) throw error
      }

      resetMasterPanel()
      flashStatus(`Imported — ${updates.length} updated, ${inserts.length} added.`, true)
      await loadParts()
    } catch (error) {
      console.error(error)
      flashStatus('Could not import — check the console for details.', false)
    } finally {
      setImporting(false)
    }
  }

  function flashProjectStatus(msg, ok) {
    setProjectStatus({ ok, msg })
    setTimeout(() => setProjectStatus(null), 3000)
  }

  function updateProjectRequired(index, required) {
    setDraftProjectItems((prev) => prev.map((r, i) => (i === index ? { ...r, required } : r)))
  }

  function updateProjectDraftField(index, field, value) {
    setDraftProjectItems((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function handleCancelProjectEdits() {
    setProjectEditMode(false)
    setDraftProjectItems([])
  }

  const visibleDraftProjectItems = useMemo(() => {
    const q = projectEditFilter.trim().toLowerCase()
    if (!q) return draftProjectItems
    return draftProjectItems.filter((r) =>
      [r.part.gcs_part_id, r.part.manufacturer, r.part.description]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    )
  }, [draftProjectItems, projectEditFilter])

  const visibleProjectItems = useMemo(() => {
    if (!projectViewFilter) return projectItems
    return projectItems.filter((item) => String(item.parts?.gcs_id ?? '') === projectViewFilter)
  }, [projectItems, projectViewFilter])

  // The GCS P/N filter on Required Parts should only offer parts actually
  // required by the selected entity, not every part in the system.
  const projectGcsIdOptions = useMemo(
    () =>
      [...new Set(projectItems.map((item) => item.parts?.gcs_id).filter((id) => id !== undefined))].sort(
        (a, b) => a - b
      ),
    [projectItems]
  )

  async function handleSaveProjectEdits() {
    setSavingProjectEdits(true)
    try {
      const toDelete = draftProjectItems.filter((r) => !r.required && r.project_part_id)
      const toInsert = draftProjectItems.filter((r) => r.required && !r.project_part_id)
      const toUpdate = draftProjectItems.filter((r) => {
        if (!r.required || !r.project_part_id) return false
        const orig = projectItems.find((item) => item.id === r.project_part_id)
        return (
          orig &&
          ((orig.target_stock ?? '') !== (r.target_stock === '' ? '' : Number(r.target_stock)) ||
            Boolean(orig.shared) !== r.shared)
        )
      })

      if (toDelete.length) {
        const { error } = await supabase
          .from('project_parts')
          .delete()
          .in('id', toDelete.map((r) => r.project_part_id))
        if (error) throw error
      }

      for (const row of toUpdate) {
        const { error } = await supabase
          .from('project_parts')
          .update({
            target_stock: row.target_stock === '' ? null : Number(row.target_stock),
            shared: row.shared,
          })
          .eq('id', row.project_part_id)
        if (error) throw error
      }

      if (toInsert.length) {
        const { error } = await supabase.from('project_parts').insert(
          toInsert.map((r) => ({
            project_id: selectedProjectId,
            part_gcs_id: r.gcs_id,
            target_stock: r.target_stock === '' ? null : Number(r.target_stock),
            shared: r.shared,
          }))
        )
        if (error) throw error
      }

      setProjectEditMode(false)
      setDraftProjectItems([])
      flashProjectStatus('Changes saved.', true)
      await Promise.all([loadProjectItems(selectedProjectId), loadStock()])
    } catch (error) {
      console.error(error)
      flashProjectStatus('Could not save changes — check the console for details.', false)
    } finally {
      setSavingProjectEdits(false)
    }
  }

  function flashStockStatus(msg, ok) {
    setStockStatus({ ok, msg })
    setTimeout(() => setStockStatus(null), 3000)
  }

  function updateStockDraftField(index, projectId, value) {
    setDraftStockItems((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, qtyByProject: { ...r.qtyByProject, [projectId]: value } } : r
      )
    )
  }

  function handleCancelStockEdits() {
    setStockEditMode(false)
    setDraftStockItems([])
  }

  const visibleStockItems = useMemo(() => {
    let items = stockViewProjectId === 'all'
      ? stockItems
      : stockItems.filter((item) => Boolean(item.perProject[stockViewProjectId]))
    if (stockViewFilter) items = items.filter((item) => String(item.gcs_id ?? '') === stockViewFilter)
    return items
  }, [stockItems, stockViewProjectId, stockViewFilter])

  // The GCS P/N filter on Inventory On Hand should only offer parts
  // applicable to whichever entity (or "All Entities") is currently
  // selected, not every part in the system.
  const stockGcsIdOptions = useMemo(() => {
    const items = stockViewProjectId === 'all'
      ? stockItems
      : stockItems.filter((item) => Boolean(item.perProject[stockViewProjectId]))
    return [...new Set(items.map((item) => item.gcs_id))].sort((a, b) => a - b)
  }, [stockItems, stockViewProjectId])

  const visibleDraftStockItems = useMemo(() => {
    const q = stockEditFilter.trim().toLowerCase()
    if (!q) return draftStockItems
    return draftStockItems.filter((r) =>
      [r.part?.gcs_part_id, r.part?.description].filter(Boolean).some((field) => field.toLowerCase().includes(q))
    )
  }, [draftStockItems, stockEditFilter])

  async function handleSaveStockEdits() {
    if (!adjustNote.trim()) {
      flashStockStatus('A reason is required before saving.', false)
      return
    }
    setSavingStockEdits(true)
    try {
      const updates = []
      for (const row of draftStockItems) {
        for (const [pidStr, valStr] of Object.entries(row.qtyByProject)) {
          const pid = Number(pidStr)
          const newVal = valStr === '' ? 0 : Number(valStr)
          const orig = row.perProject[pid]?.onHand ?? 0
          if (newVal !== orig) {
            updates.push({ project_id: pid, part_gcs_id: row.gcs_id, quantity: newVal, previous: orig })
          }
        }
      }

      if (updates.length) {
        const { error } = await supabase
          .from('stock_on_hand')
          .upsert(
            updates.map((u) => ({ project_id: u.project_id, part_gcs_id: u.part_gcs_id, quantity: u.quantity })),
            { onConflict: 'project_id,part_gcs_id' }
          )
        if (error) throw error

        const { data: journalRow, error: journalError } = await supabase
          .from('inventory_journal')
          .insert({ entry_type: 'adjustment', note: adjustNote.trim() })
          .select()
          .single()
        if (journalError) throw journalError

        const { error: lineError } = await supabase.from('inventory_journal_lines').insert(
          updates.map((u) => ({
            journal_id: journalRow.id,
            project_id: u.project_id,
            part_gcs_id: u.part_gcs_id,
            previous_quantity: u.previous,
            new_quantity: u.quantity,
          }))
        )
        if (lineError) throw lineError
      }

      setStockEditMode(false)
      setDraftStockItems([])
      setAdjustNote('')
      flashStockStatus(updates.length ? 'Changes saved.' : 'No changes to save.', true)
      await loadStock()
    } catch (error) {
      console.error(error)
      flashStockStatus('Could not save changes — check the console for details.', false)
    } finally {
      setSavingStockEdits(false)
    }
  }

  function updateLocationDraftField(index, field, value) {
    setDraftLocationItems((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function handleCancelLocationEdits() {
    setLocationEditMode(false)
    setDraftLocationItems([])
    setLocationNote('')
  }

  const visibleDraftLocationItems = useMemo(() => {
    const q = locationEditFilter.trim().toLowerCase()
    if (!q) return draftLocationItems
    return draftLocationItems.filter((r) =>
      [r.part?.gcs_part_id, r.part?.description].filter(Boolean).some((field) => field.toLowerCase().includes(q))
    )
  }, [draftLocationItems, locationEditFilter])

  async function handleSaveLocationEdits() {
    if (!locationNote.trim()) {
      flashStockStatus('A reason is required before saving.', false)
      return
    }
    setSavingLocationEdits(true)
    try {
      const updates = []
      const negativeErrors = []
      for (const row of draftLocationItems) {
        const newStorage = row.storage_qty === '' ? 0 : Number(row.storage_qty)
        const newBarn = row.barn_qty === '' ? 0 : Number(row.barn_qty)
        const origStorage = row.part?.storage_qty ?? 0
        const origBarn = row.part?.barn_qty ?? 0
        if (newStorage !== origStorage || newBarn !== origBarn) {
          if (row.onHandSum - newStorage - newBarn < 0) {
            negativeErrors.push(row.part?.gcs_part_id || row.gcs_id)
            continue
          }
          updates.push({
            gcs_id: row.gcs_id,
            newStorage,
            newBarn,
            origStorage,
            origBarn,
          })
        }
      }

      if (negativeErrors.length) {
        flashStockStatus(
          `Storage + Barn can't exceed Total On-Hand for: ${negativeErrors.join(', ')}`,
          false
        )
        setSavingLocationEdits(false)
        return
      }

      if (updates.length) {
        for (const u of updates) {
          const { error } = await supabase
            .from('parts')
            .update({ storage_qty: u.newStorage, barn_qty: u.newBarn })
            .eq('gcs_id', u.gcs_id)
          if (error) throw error
        }

        const { data: journalRow, error: journalError } = await supabase
          .from('inventory_journal')
          .insert({ entry_type: 'location_adjustment', note: locationNote.trim() })
          .select()
          .single()
        if (journalError) throw journalError

        const { error: lineError } = await supabase.from('inventory_journal_lines').insert(
          updates.map((u) => ({
            journal_id: journalRow.id,
            part_gcs_id: u.gcs_id,
            previous_storage_qty: u.origStorage,
            new_storage_qty: u.newStorage,
            previous_barn_qty: u.origBarn,
            new_barn_qty: u.newBarn,
          }))
        )
        if (lineError) throw lineError
      }

      setLocationEditMode(false)
      setDraftLocationItems([])
      setLocationNote('')
      flashStockStatus(updates.length ? 'Locations saved.' : 'No changes to save.', true)
      await loadParts()
    } catch (error) {
      console.error(error)
      flashStockStatus('Could not save locations — check the console for details.', false)
    } finally {
      setSavingLocationEdits(false)
    }
  }

  function resetStockPanel() {
    setStockPanel(null)
    setUploadFileName('')
    setUploadPreview(null)
    setUploadErrors([])
    setUploadNote('')
  }

  // Also used as the explicit "From Project" selector while recording a use
  // or a transfer -- switching it mid-mode clears any typed-but-unsubmitted
  // quantities so a number meant for one entity's part row can't silently
  // carry over and get applied to a different entity's row for that same
  // part.
  function handleChangeStockViewProject(value) {
    setStockViewProjectId(value === 'all' ? 'all' : Number(value))
    if (recordUseMode) setUseQtyByPart({})
    if (transferMode) setTransferQtyByPart({})
  }

  function startRecordPartUse() {
    if (stockViewProjectId === 'all') {
      setStockViewProjectId(projects[0]?.id ?? 'all')
    }
    setUseNote('')
    setUseQtyByPart({})
    setRecordUseMode(true)
  }

  function cancelRecordPartUse() {
    setRecordUseMode(false)
    setUseNote('')
    setUseQtyByPart({})
  }

  function updateUseQty(partId, value) {
    setUseQtyByPart((prev) => ({ ...prev, [partId]: value }))
  }

  async function handleRecordPartUse(partId) {
    if (stockViewProjectId === 'all') {
      flashStockStatus('Select a specific entity first.', false)
      return
    }
    if (!useNote.trim()) {
      flashStockStatus('A reason is required before saving.', false)
      return
    }
    const qty = Number(useQtyByPart[partId])
    if (!qty || qty <= 0) {
      flashStockStatus('Enter a quantity greater than zero.', false)
      return
    }

    const item = stockItems.find((s) => s.gcs_id === partId)
    const current = item?.perProject?.[stockViewProjectId]?.onHand ?? 0
    const newQty = current - qty
    if (newQty < 0) {
      flashStockStatus(`Not enough on hand at this project (${current} available).`, false)
      return
    }

    setSavingUsePartId(partId)
    try {
      const { data: journalRow, error: journalError } = await supabase
        .from('inventory_journal')
        .insert({ entry_type: 'use', note: useNote.trim() })
        .select()
        .single()
      if (journalError) throw journalError

      const { error } = await supabase
        .from('stock_on_hand')
        .upsert(
          { project_id: stockViewProjectId, part_gcs_id: partId, quantity: newQty },
          { onConflict: 'project_id,part_gcs_id' }
        )
      if (error) throw error

      const { error: lineError } = await supabase.from('inventory_journal_lines').insert({
        journal_id: journalRow.id,
        project_id: stockViewProjectId,
        part_gcs_id: partId,
        previous_quantity: current,
        new_quantity: newQty,
      })
      if (lineError) throw lineError

      setUseQtyByPart((prev) => ({ ...prev, [partId]: '' }))
      flashStockStatus('Part use recorded.', true)
      await loadStock()
    } catch (error) {
      console.error(error)
      flashStockStatus('Could not record part use — check the console for details.', false)
    } finally {
      setSavingUsePartId(null)
    }
  }

  function startStockTransfer() {
    if (stockViewProjectId === 'all') {
      setStockViewProjectId(projects[0]?.id ?? 'all')
    }
    setTransferToProjectId(null)
    setTransferNote('')
    setTransferQtyByPart({})
    setTransferMode(true)
  }

  function cancelStockTransfer() {
    setTransferMode(false)
    setTransferToProjectId(null)
    setTransferNote('')
    setTransferQtyByPart({})
  }

  function updateTransferQty(partId, value) {
    setTransferQtyByPart((prev) => ({ ...prev, [partId]: value }))
  }

  // A transfer is one journal entry with two lines — the source project's
  // decrease and the destination's matching increase — so the net change
  // across the system is always zero and both sides show up together in
  // history.
  async function handleStockTransfer(partId) {
    if (stockViewProjectId === 'all') {
      flashStockStatus('Select a specific entity first.', false)
      return
    }
    if (!transferToProjectId) {
      flashStockStatus('Select a destination entity.', false)
      return
    }
    if (String(transferToProjectId) === String(stockViewProjectId)) {
      flashStockStatus('Destination must be a different entity.', false)
      return
    }
    if (!transferNote.trim()) {
      flashStockStatus('A reason is required before saving.', false)
      return
    }
    const qty = Number(transferQtyByPart[partId])
    if (!qty || qty <= 0) {
      flashStockStatus('Enter a quantity greater than zero.', false)
      return
    }

    const item = stockItems.find((s) => s.gcs_id === partId)
    const fromCurrent = item?.perProject?.[stockViewProjectId]?.onHand ?? 0
    const fromNew = fromCurrent - qty
    if (fromNew < 0) {
      flashStockStatus(`Not enough on hand at this project (${fromCurrent} available).`, false)
      return
    }
    const toEntry = item?.perProject?.[transferToProjectId]
    if (!toEntry) {
      const toName = projects.find((p) => String(p.id) === String(transferToProjectId))?.name || 'That entity'
      flashStockStatus(`${toName} doesn't use this part — add it on Required Inventory first.`, false)
      return
    }
    const toCurrent = toEntry.onHand ?? 0
    const toNew = toCurrent + qty

    const fromProjectName =
      projects.find((p) => String(p.id) === String(stockViewProjectId))?.name || 'entity'
    const toProjectName =
      projects.find((p) => String(p.id) === String(transferToProjectId))?.name || 'entity'

    setSavingTransferPartId(partId)
    try {
      const { data: journalRow, error: journalError } = await supabase
        .from('inventory_journal')
        .insert({
          entry_type: 'transfer',
          note: `${transferNote.trim()} (${fromProjectName} → ${toProjectName})`,
        })
        .select()
        .single()
      if (journalError) throw journalError

      const { error: fromError } = await supabase
        .from('stock_on_hand')
        .upsert(
          { project_id: stockViewProjectId, part_gcs_id: partId, quantity: fromNew },
          { onConflict: 'project_id,part_gcs_id' }
        )
      if (fromError) throw fromError

      const { error: toError } = await supabase
        .from('stock_on_hand')
        .upsert(
          { project_id: transferToProjectId, part_gcs_id: partId, quantity: toNew },
          { onConflict: 'project_id,part_gcs_id' }
        )
      if (toError) throw toError

      const { error: lineError } = await supabase.from('inventory_journal_lines').insert([
        {
          journal_id: journalRow.id,
          project_id: stockViewProjectId,
          part_gcs_id: partId,
          previous_quantity: fromCurrent,
          new_quantity: fromNew,
        },
        {
          journal_id: journalRow.id,
          project_id: transferToProjectId,
          part_gcs_id: partId,
          previous_quantity: toCurrent,
          new_quantity: toNew,
        },
      ])
      if (lineError) throw lineError

      setTransferQtyByPart((prev) => ({ ...prev, [partId]: '' }))
      flashStockStatus('Stock transfer recorded.', true)
      await loadStock()
    } catch (error) {
      console.error(error)
      flashStockStatus('Could not record stock transfer — check the console for details.', false)
    } finally {
      setSavingTransferPartId(null)
    }
  }

  function findProjectByName(name) {
    const q = (name || '').trim().toLowerCase()
    if (!q) return null
    return (
      projects.find((p) => p.name.toLowerCase() === q) ||
      projects.find((p) => shortProjectName(p.name).toLowerCase() === q) ||
      null
    )
  }

  function handleExportInventory() {
    const rows = []
    for (const item of stockItems) {
      for (const p of projects) {
        const entry = item.perProject[p.id]
        if (entry) {
          rows.push({ 'GCS P/N': item.gcs_id, Entity: p.name, Quantity: entry.onHand ?? 0 })
        }
      }
    }
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-on-hand-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleUploadFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFileName(file.name)
    setUploadPreview(null)
    setUploadErrors([])

    const text = await file.text()
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })

    const fields = parsed.meta.fields || []
    const fieldMap = {}
    for (const f of fields) fieldMap[normalizeHeader(f)] = f

    const gcsKey = fieldMap['gcspn'] || fieldMap['gcsid'] || fieldMap['gcs']
    const projectKey = fieldMap['entity'] || fieldMap['project'] || fieldMap['site']
    const qtyKey = fieldMap['quantity'] || fieldMap['qty'] || fieldMap['stockonhand']

    if (!gcsKey || !projectKey || !qtyKey) {
      setUploadErrors([
        'CSV must have columns for GCS P/N, Entity, and Quantity (column names not recognized).',
      ])
      return
    }

    const errors = []
    const validRows = []
    parsed.data.forEach((row, i) => {
      const rowNum = i + 2 // account for header row, 1-indexed
      const gcsId = parseInt(row[gcsKey], 10)
      const part = parts.find((p) => p.gcs_id === gcsId)
      const project = findProjectByName(row[projectKey])
      const qty = parseInt(row[qtyKey], 10)

      if (!part) {
        errors.push(`Row ${rowNum}: GCS P/N "${row[gcsKey]}" not found in Master List.`)
        return
      }
      if (!project) {
        errors.push(`Row ${rowNum}: Entity "${row[projectKey]}" does not match any entity.`)
        return
      }
      if (Number.isNaN(qty) || qty < 0) {
        errors.push(`Row ${rowNum}: Quantity "${row[qtyKey]}" is not a valid number.`)
        return
      }
      validRows.push({ gcs_id: gcsId, part, project_id: project.id, project_name: project.name, quantity: qty })
    })

    setUploadErrors(errors)

    if (validRows.length === 0) {
      setUploadPreview(null)
      return
    }

    const uniqueGcsIds = [...new Set(validRows.map((r) => r.gcs_id))]
    const { data: existing, error } = await supabase
      .from('stock_on_hand')
      .select('project_id, part_gcs_id, quantity')
      .in('part_gcs_id', uniqueGcsIds)

    if (error) {
      setUploadErrors((prev) => [...prev, 'Could not look up current stock — check the console.'])
      console.error(error)
      return
    }

    const prevMap = new Map((existing ?? []).map((r) => [`${r.project_id}:${r.part_gcs_id}`, r.quantity]))
    const rows = validRows.map((r) => ({
      ...r,
      previous: prevMap.get(`${r.project_id}:${r.gcs_id}`) ?? null,
    }))

    setUploadPreview({ rows })
  }

  async function handleConfirmUpload() {
    if (!uploadPreview || uploadPreview.rows.length === 0) return
    if (!uploadNote.trim()) {
      flashStockStatus('A reason is required before uploading.', false)
      return
    }
    setUploading(true)
    try {
      const { rows } = uploadPreview
      const { data: journalRow, error: journalError } = await supabase
        .from('inventory_journal')
        .insert({
          entry_type: 'count',
          note: `${uploadNote.trim()} — ${uploadFileName} (${rows.length} rows)`,
        })
        .select()
        .single()
      if (journalError) throw journalError

      const batchSize = 500
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { error: upsertError } = await supabase
          .from('stock_on_hand')
          .upsert(
            batch.map((r) => ({ project_id: r.project_id, part_gcs_id: r.gcs_id, quantity: r.quantity })),
            { onConflict: 'project_id,part_gcs_id' }
          )
        if (upsertError) throw upsertError

        const { error: lineError } = await supabase.from('inventory_journal_lines').insert(
          batch.map((r) => ({
            journal_id: journalRow.id,
            project_id: r.project_id,
            part_gcs_id: r.gcs_id,
            previous_quantity: r.previous,
            new_quantity: r.quantity,
          }))
        )
        if (lineError) throw lineError
      }

      resetStockPanel()
      flashStockStatus(`Inventory count uploaded — ${rows.length} rows updated.`, true)
      await loadStock()
    } catch (error) {
      console.error(error)
      flashStockStatus('Could not upload inventory count — check the console for details.', false)
    } finally {
      setUploading(false)
    }
  }

  async function loadJournalEntries() {
    setJournalLoading(true)
    const { data, error } = await supabase
      .from('inventory_journal')
      .select('*, inventory_journal_lines(count)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      console.error(error)
      flashStockStatus('Could not load history — check the console for details.', false)
    } else {
      setJournalEntries(data ?? [])
    }
    setJournalLoading(false)
  }

  async function toggleJournalExpand(id) {
    if (expandedJournalId === id) {
      setExpandedJournalId(null)
      return
    }
    setExpandedJournalId(id)
    if (journalLines[id]) return
    const { data, error } = await supabase
      .from('inventory_journal_lines')
      .select('*')
      .eq('journal_id', id)
      .order('id', { ascending: true })
    if (error) {
      console.error(error)
      return
    }
    setJournalLines((prev) => ({ ...prev, [id]: data ?? [] }))
  }

  function flashPoStatus(msg, ok) {
    setPoStatus({ ok, msg })
    setTimeout(() => setPoStatus(null), 3000)
  }

  // Attaches this session's per-role entity scope (from user_role_entities)
  // onto loggedInUser so canApproveRequests/canIssuePurchaseOrder can read
  // `user.entity_scopes` -- a role with no rows here is unscoped (sees every
  // entity), same as before this existed.
  const loggedInUserWithScopes = useMemo(() => {
    if (!loggedInUser) return loggedInUser
    const scopes = {}
    for (const row of userRoleEntities) {
      if (row.user_id !== loggedInUser.id) continue
      if (!scopes[row.role]) scopes[row.role] = []
      scopes[row.role].push(row.project_id)
    }
    return { ...loggedInUser, entity_scopes: scopes }
  }, [loggedInUser, userRoleEntities])

  const visiblePurchaseRequests = useMemo(() => {
    let list = purchaseRequests
    // A vendor-logon account only ever sees their own vendor's actual POs —
    // once a PO number has been issued, not drafts/requisitions/approvals.
    if (isVendorUser(loggedInUserWithScopes)) {
      list = list.filter(
        (r) =>
          r.vendor_id === loggedInUserWithScopes.vendor_id && (r.status === 'issued' || r.status === 'closed')
      )
    }
    // "My POs for Approval" / "My POs to Issue" are role-based presets
    // (entity-scoped per user), not per-request assignment -- anyone
    // holding the role, for that request's entity, sees it.
    if (poView === 'my-approvals') {
      list = list.filter((r) => r.status === 'submitted' && canApproveRequests(loggedInUserWithScopes, r))
    }
    if (poView === 'my-issue') {
      list = list.filter((r) => r.status === 'approved' && canIssuePurchaseOrder(loggedInUserWithScopes, r))
    }
    if (poStatusFilter) list = list.filter((r) => r.status === poStatusFilter)
    if (poProjectFilter) list = list.filter((r) => String(r.project_id) === poProjectFilter)
    return list
  }, [purchaseRequests, poStatusFilter, poProjectFilter, loggedInUserWithScopes, poView])

  // Flattened { request, invoice } pairs for the "My Invoices for Approval"
  // view -- its rows are invoices, not purchase requests, so it can't reuse
  // the PO summary table's row shape. Approval is a company-wide role
  // (invoice_approval), not scoped to any particular person or entity, so
  // every unapproved matched invoice shows up here for anyone holding it.
  const invoicesPendingApproval = useMemo(() => {
    const pairs = []
    for (const r of purchaseRequests) {
      for (const invoice of r.invoices || []) {
        if (!invoice.approved && invoice.matched_receipt_id) {
          pairs.push({ request: r, invoice })
        }
      }
    }
    return pairs
  }, [purchaseRequests])

  // Counts for the small nav badges -- independent of whichever poView is
  // currently selected, so "3 POs waiting on you" is visible from any tab,
  // not just after already clicking into Purchase Orders.
  const poAttentionCounts = useMemo(() => {
    const approvals = purchaseRequests.filter(
      (r) => r.status === 'submitted' && canApproveRequests(loggedInUserWithScopes, r)
    ).length
    const toIssue = purchaseRequests.filter(
      (r) => r.status === 'approved' && canIssuePurchaseOrder(loggedInUserWithScopes, r)
    ).length
    const invoicesToApprove = userHasRole(loggedInUserWithScopes, 'invoice_approval')
      ? invoicesPendingApproval.length
      : 0
    return { approvals, toIssue, invoicesToApprove, total: approvals + toIssue + invoicesToApprove }
  }, [purchaseRequests, loggedInUserWithScopes, invoicesPendingApproval])

  function toggleExpandedPo(id) {
    setExpandedPoId((prev) => {
      const next = prev === id ? null : id
      if (next) loadPoActivity(next)
      return next
    })
  }

  const poEligibleParts = useMemo(
    () => parts.filter((p) => poDraftEligiblePartIds.has(p.gcs_id)),
    [parts, poDraftEligiblePartIds]
  )

  function openPoDraftForm(existing, prefill) {
    setPoDraftInvoiceNumber('')
    setPoDraftInvoiceAmount('')
    setPoDraftNewInvoiceFile(null)
    if (existing) {
      setPoDraftId(existing.id)
      setPoDraftProjectId(existing.project_id)
      setPoDraftVendorId(existing.vendor_id)
      setPoDraftNotes(existing.notes || '')
      setPoDraftDescription(existing.description || '')
      setPoDraftBudgetCategoryId(existing.budget_category_id ?? null)
      setPoDraftBudgetSubcategoryId(existing.budget_subcategory_id ?? null)
      setPoDraftSubProjectId(existing.sub_project_id ?? null)
      setPoDraftTicketSystemTicketId(existing.ticket_system_ticket_id ?? null)
      setPoDraftTicketSystemTicketNumber(existing.ticket_system_ticket_number ?? null)
      setPoDraftChargeableExpense(Boolean(existing.chargeable_expense))
      setPoDraftVendorQuoteNumber(existing.vendor_quote_number || '')
      setPoDraftQuoteFileUrl(existing.quote_file_url || null)
      setPoDraftQuoteFileName(existing.quote_file_name || null)
      setPoDraftNewQuoteFile(null)
      setPoDraftCategory(existing.po_category || 'purchase')
      setPoDraftMarkupRate(
        existing.markup_rate === null || existing.markup_rate === undefined ? '10' : String(existing.markup_rate)
      )
      setPoDraftTaxRate(
        existing.tax_rate === null || existing.tax_rate === undefined ? '13' : String(existing.tax_rate)
      )
      setPoDraftShippingHandling(
        existing.shipping_handling === null || existing.shipping_handling === undefined
          ? '0'
          : String(existing.shipping_handling)
      )
      setPoDraftCredit(
        existing.credit === null || existing.credit === undefined ? '0' : String(existing.credit)
      )
      setPoDraftNotToExceed(Boolean(existing.not_to_exceed))
      setPoDraftSpendingCap(
        existing.spending_cap === null || existing.spending_cap === undefined
          ? ''
          : String(existing.spending_cap)
      )
      setPoDraftCurrency(existing.currency || 'CAD')
      setPoDraftLines(
        (existing.purchase_request_lines || []).map((l) => ({
          _tempId: crypto.randomUUID(),
          id: l.id,
          line_type: l.line_type,
          part_gcs_id: l.part_gcs_id,
          description: l.description || '',
          quantity: String(l.quantity ?? 1),
          unit_cost: l.unit_cost === null || l.unit_cost === undefined ? '' : String(l.unit_cost),
          partSearch: '',
        }))
      )
    } else {
      setPoDraftId(null)
      setPoDraftProjectId(prefill?.projectId ?? selectedProjectId ?? projects[0]?.id ?? null)
      setPoDraftVendorId(prefill?.vendorId ?? null)
      setPoDraftNotes('')
      setPoDraftDescription(prefill?.description ?? '')
      setPoDraftBudgetCategoryId(null)
      setPoDraftBudgetSubcategoryId(null)
      setPoDraftSubProjectId(prefill?.subProjectId ?? null)
      setPoDraftTicketSystemTicketId(prefill?.ticketSystemTicketId ?? null)
      setPoDraftTicketSystemTicketNumber(prefill?.ticketSystemTicketNumber ?? null)
      setPoDraftChargeableExpense(false)
      setPoDraftVendorQuoteNumber(prefill?.vendorQuoteNumber ?? '')
      setPoDraftQuoteFileUrl(null)
      setPoDraftQuoteFileName(null)
      setPoDraftNewQuoteFile(null)
      setPoDraftCategory('purchase')
      setPoDraftMarkupRate('10')
      setPoDraftTaxRate('13')
      setPoDraftShippingHandling('0')
      setPoDraftCredit('0')
      setPoDraftNotToExceed(false)
      setPoDraftSpendingCap('')
      setPoDraftCurrency('CAD')
      setPoDraftLines([blankPurchaseRequestLine(categoryLineType('purchase'))])
    }
    setPoDraftFieldErrors({})
    setPoFormOpen(true)
  }

  function closePoDraftForm() {
    setPoFormOpen(false)
    setPoDraftId(null)
    setPoDraftLines([])
    setPoDraftFieldErrors({})
    setPoDraftInvoiceNumber('')
    setPoDraftInvoiceAmount('')
    setPoDraftNewInvoiceFile(null)
  }

  // Deep link from the ticket system's "Create Purchase Rec" button:
  // ?po=new&entity_id=&sub_project_id=&vendor_name=&quote=&description=&ticket_id=&ticket_number=
  // opens this tab with the New Purchase Request form pre-filled from
  // whatever the ticket already had on file. ticket_id/ticket_number (only
  // present when linked from an existing ticket, not a brand new one) ride
  // along onto the saved request so the ticket system can look it back up.
  // Runs once real data exists to match against
  // (and once signed in, since the link may land here before login) -- the
  // ref guard stops a later reload of projects/vendors from reopening it.
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (deepLinkHandledRef.current) return
    if (!loggedInUser) return

    const params = new URLSearchParams(window.location.search)
    const mode = params.get('po')

    // ?po=view&id= -- a ticket's linked-purchase-request badge, opening
    // straight to that request's detail view (where "View PO" shows the
    // print-ready layout, once it's approved or later).
    if (mode === 'view') {
      const requestId = Number(params.get('id'))
      if (!requestId) return
      deepLinkHandledRef.current = true
      window.history.replaceState(null, '', window.location.pathname)
      setActiveTab('po')
      setExpandedPoId(requestId)
      return
    }

    if (mode !== 'new') return
    if (projects.length === 0 || vendors.length === 0) return

    deepLinkHandledRef.current = true
    window.history.replaceState(null, '', window.location.pathname)

    setActiveTab('po')
    if (!canCreatePurchaseRequests(loggedInUser)) return

    const entityId = params.get('entity_id')
    const subProjectId = params.get('sub_project_id')
    const vendorName = params.get('vendor_name')?.trim().toLowerCase()

    const matchedEntity = entityId ? projects.find((p) => String(p.id) === entityId) : null
    const matchedSubProject = subProjectId
      ? subProjects.find((sp) => String(sp.id) === subProjectId)
      : null
    const matchedVendor = vendorName
      ? vendors.find((v) => v.name?.trim().toLowerCase() === vendorName)
      : null

    openPoDraftForm(null, {
      projectId: matchedEntity?.id ?? null,
      subProjectId: matchedSubProject?.id ?? null,
      vendorId: matchedVendor?.id ?? null,
      vendorQuoteNumber: params.get('quote') ?? '',
      description: params.get('description') ?? '',
      ticketSystemTicketId: params.get('ticket_id') || null,
      ticketSystemTicketNumber: params.get('ticket_number') ? Number(params.get('ticket_number')) : null,
    })
  }, [loggedInUser, projects, subProjects, vendors])

  function handleAddPurchaseRequestLine() {
    // Line type is dictated by the PO's category now (Purchase = parts,
    // Service/Not to Exceed = services) -- no per-line type picker anymore.
    setPoDraftLines((prev) => [...prev, blankPurchaseRequestLine(categoryLineType(poDraftCategory))])
  }

  function handleRemovePurchaseRequestLine(index) {
    setPoDraftLines((prev) => prev.filter((_, i) => i !== index))
  }

  // Switching category switches every existing line's type to match, since
  // Purchase POs are parts-only and Service/Not to Exceed POs are
  // services-only -- there's no manual per-line override anymore.
  function updatePoDraftCategory(category) {
    setPoDraftCategory(category)
    const lineType = categoryLineType(category)
    setPoDraftLines((prev) => prev.map((l) => ({ ...l, line_type: lineType })))
    // Not to Exceed only ever makes sense on a Service PO -- switching away
    // from Service clears it rather than leaving a stale flag/cap behind.
    if (category !== 'service') {
      setPoDraftNotToExceed(false)
      setPoDraftSpendingCap('')
    }
  }

  function updatePoDraftLineField(index, field, value) {
    setPoDraftLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const updated = { ...l, [field]: value }
        // Pre-fill the price from the part's last-paid cost so purchasers
        // aren't starting from a blank field — still freely overridable.
        if (field === 'part_gcs_id' && !l.unit_cost) {
          const part = parts.find((p) => p.gcs_id === value)
          if (part?.last_cost !== null && part?.last_cost !== undefined) {
            updated.unit_cost = String(part.last_cost)
          }
        }
        return updated
      })
    )
  }

  // Applies the items ticked in the form's "Read from the PDF" box (see
  // tabs/PdfReadPanel.jsx). `sel` holds only the ticked items: entity, site,
  // vendor, currency, quote, tax, shipping, markup, lines. Returns false if
  // the person backed out of replacing their existing lines.
  async function applyPdfReadToDraft(sel) {
    let newLines = null
    if (sel.lines) {
      const hasContent = poDraftLines.some(
        (l) => l.part_gcs_id || (l.description || '').trim() || (l.unit_cost !== '' && l.unit_cost != null)
      )
      if (
        hasContent &&
        !window.confirm(
          `Replace the ${poDraftLines.length} line${poDraftLines.length === 1 ? '' : 's'} already on this form with the ${sel.lines.length} read from the PDF?`
        )
      ) {
        return false
      }

      const lineType = categoryLineType(poDraftCategory)
      // Parts are matched against what's stocked for the entity the form will
      // have once this is applied -- same list the part picker offers.
      let eligibleParts = []
      if (lineType === 'part') {
        const targetProjectId = sel.entity ?? poDraftProjectId
        let eligibleIds = poDraftEligiblePartIds
        if (targetProjectId && targetProjectId !== poDraftProjectId) {
          const { data } = await supabase.from('project_parts').select('part_gcs_id').eq('project_id', targetProjectId)
          eligibleIds = new Set((data ?? []).map((r) => r.part_gcs_id))
        }
        eligibleParts = parts.filter((p) => eligibleIds.has(p.gcs_id))
      }

      newLines = sel.lines.map((l) => {
        const line = {
          ...blankPurchaseRequestLine(lineType),
          quantity: String(l.quantity),
          unit_cost: String(l.unitPrice),
          // Marks a line that came from a PDF, so saving can refuse to
          // silently drop one that never got matched to a part.
          _scraped: true,
        }
        if (lineType === 'service') return { ...line, description: l.description }
        const part = l.partNumber ? matchPart(l.partNumber, eligibleParts) : null
        return {
          ...line,
          part_gcs_id: part ? part.gcs_id : null,
          // Unmatched: leave the vendor's part number in the search box so the
          // picker narrows to likely candidates, and keep it in the note.
          partSearch: part ? '' : l.partNumber || '',
          description: part ? l.description : [l.partNumber, l.description].filter(Boolean).join(' — '),
        }
      })
    }

    if (sel.entity !== undefined) {
      setPoDraftProjectId(sel.entity)
      setPoDraftSubProjectId(sel.site ?? null)
    } else if (sel.site !== undefined) {
      setPoDraftSubProjectId(sel.site)
    }
    if (sel.vendor !== undefined) setPoDraftVendorId(sel.vendor)
    if (sel.currency !== undefined) setPoDraftCurrency(sel.currency)
    if (sel.quote !== undefined) setPoDraftVendorQuoteNumber(sel.quote)
    if (sel.tax !== undefined) setPoDraftTaxRate(String(sel.tax))
    if (sel.shipping !== undefined) setPoDraftShippingHandling(String(sel.shipping))
    if (sel.markup !== undefined) setPoDraftMarkupRate(String(sel.markup))
    if (newLines) setPoDraftLines(newLines)
    return true
  }

  async function handleCreatePurchaseRequest() {
    // A line read from a PDF that was never matched to a part would be
    // dropped by the filter below without a word -- stop and say so instead.
    const unmatchedFromPdf = poDraftLines.filter(
      (l) => l._scraped && l.line_type === 'part' && !l.part_gcs_id && Number(l.unit_cost) > 0
    )
    if (unmatchedFromPdf.length > 0) {
      flashPoStatus(
        `Pick a part for ${unmatchedFromPdf.length === 1 ? 'the line' : `each of the ${unmatchedFromPdf.length} lines`} read from the PDF (or delete ${unmatchedFromPdf.length === 1 ? 'it' : 'them'}) — or switch the PO Category to Service.`,
        false
      )
      return
    }
    const validLines = poDraftLines.filter((l) =>
      l.line_type === 'part' ? Boolean(l.part_gcs_id) : (l.description || '').trim() !== ''
    )
    const mixedTypes = linesAreMixedType(validLines)
    const entitySubProjects = subProjects.filter((sp) => sp.project_id === poDraftProjectId)
    const errors = {}
    if (!poDraftProjectId) errors.project = true
    if (!poDraftVendorId) errors.vendor = true
    if (validLines.length === 0 || mixedTypes) errors.lines = true
    if (entitySubProjects.length > 0 && !poDraftSubProjectId) errors.subProject = true

    if (Object.keys(errors).length > 0) {
      setPoDraftFieldErrors(errors)
      flashPoStatus(
        mixedTypes
          ? 'A purchase order cannot mix parts and services — use one type per PO.'
          : errors.subProject
          ? 'Select which project this request is for.'
          : 'Fill in the highlighted fields before saving.',
        false
      )
      return
    }
    if (poDraftNewQuoteFile && poDraftNewQuoteFile.type !== 'application/pdf') {
      flashPoStatus('Quote attachment must be a PDF file.', false)
      return
    }
    const wantsInvoice = Boolean(poDraftNewInvoiceFile || poDraftInvoiceNumber.trim() || poDraftInvoiceAmount !== '')
    const invoiceAmount = Number(poDraftInvoiceAmount)
    if (wantsInvoice) {
      if (!poDraftNewInvoiceFile || poDraftNewInvoiceFile.type !== 'application/pdf') {
        flashPoStatus('Choose a PDF file for the invoice.', false)
        return
      }
      if (poDraftInvoiceAmount === '' || Number.isNaN(invoiceAmount) || invoiceAmount <= 0) {
        flashPoStatus('Enter a valid invoice amount.', false)
        return
      }
    }
    setPoDraftFieldErrors({})

    // Markup/shipping only ever apply to a Purchase-category PO; Service and
    // Not to Exceed POs get zero for both regardless of what's still in the
    // (hidden) fields, and only a Not to Exceed PO stores a spending cap.
    const isPurchaseCategory = poDraftCategory === 'purchase'
    const markupRateToSave = isPurchaseCategory ? (poDraftMarkupRate === '' ? 10 : Number(poDraftMarkupRate)) : 0
    const shippingToSave = isPurchaseCategory
      ? poDraftShippingHandling === ''
        ? 0
        : Number(poDraftShippingHandling)
      : 0
    const notToExceedToSave = poDraftCategory === 'service' && poDraftNotToExceed
    const spendingCapToSave = notToExceedToSave && poDraftSpendingCap !== '' ? Number(poDraftSpendingCap) : null

    setSavingPoRequest(true)
    try {
      let quoteFileUrl = poDraftQuoteFileUrl
      let quoteFileName = poDraftQuoteFileName
      if (poDraftNewQuoteFile) {
        const ext = poDraftNewQuoteFile.name.split('.').pop() || 'pdf'
        const path = `quote-${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('quotes')
          .upload(path, poDraftNewQuoteFile, { contentType: 'application/pdf' })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('quotes').getPublicUrl(path)
        quoteFileUrl = urlData.publicUrl
        quoteFileName = poDraftNewQuoteFile.name
      }

      let requestId = poDraftId
      if (requestId) {
        const newValues = {
          project_id: poDraftProjectId,
          vendor_id: poDraftVendorId,
          description: poDraftDescription.trim() || null,
          vendor_quote_number: poDraftVendorQuoteNumber.trim() || null,
          po_category: poDraftCategory,
          markup_rate: markupRateToSave,
          tax_rate: poDraftTaxRate === '' ? 13 : Number(poDraftTaxRate),
          shipping_handling: shippingToSave,
          credit: poDraftCredit === '' ? 0 : Number(poDraftCredit),
          not_to_exceed: notToExceedToSave,
          spending_cap: spendingCapToSave,
        }

        const { error } = await supabase
          .from('purchase_requests')
          .update({
            ...newValues,
            sub_project_id: poDraftSubProjectId,
            notes: poDraftNotes.trim() || null,
            budget_category_id: poDraftBudgetCategoryId,
            budget_subcategory_id: poDraftBudgetSubcategoryId,
            chargeable_expense: poDraftChargeableExpense,
            quote_file_url: quoteFileUrl,
            quote_file_name: quoteFileName,
            currency: poDraftCurrency.trim() || 'CAD',
          })
          .eq('id', requestId)
        if (error) throw error

        // One compact activity-log entry per save, covering just the
        // fields most worth tracking (not every column) -- same "bullet
        // list of what changed" shape ticket-system uses for its own log.
        const existing = purchaseRequests.find((r) => r.id === requestId)
        if (existing) {
          const projectName = (id) => projects.find((p) => p.id === id)?.name || '—'
          const vendorName = (id) => vendors.find((v) => v.id === id)?.name || '—'
          const changeLines = []
          if (existing.project_id !== newValues.project_id) {
            changeLines.push(`Entity: ${projectName(existing.project_id)} → ${projectName(newValues.project_id)}`)
          }
          if (existing.vendor_id !== newValues.vendor_id) {
            changeLines.push(`Vendor: ${vendorName(existing.vendor_id)} → ${vendorName(newValues.vendor_id)}`)
          }
          if ((existing.description || '') !== (newValues.description || '')) {
            changeLines.push(`Description: ${newValues.description || '(cleared)'}`)
          }
          if (existing.po_category !== newValues.po_category) {
            changeLines.push(
              `Category: ${PO_CATEGORY_LABELS[existing.po_category] || existing.po_category} → ${
                PO_CATEGORY_LABELS[newValues.po_category] || newValues.po_category
              }`
            )
          }
          if (Number(existing.markup_rate) !== newValues.markup_rate) {
            changeLines.push(`Markup: ${existing.markup_rate}% → ${newValues.markup_rate}%`)
          }
          if (Number(existing.tax_rate) !== newValues.tax_rate) {
            changeLines.push(`Sales Tax: ${existing.tax_rate}% → ${newValues.tax_rate}%`)
          }
          if (Number(existing.shipping_handling) !== newValues.shipping_handling) {
            changeLines.push(`Shipping/Handling: $${existing.shipping_handling} → $${newValues.shipping_handling}`)
          }
          if (Number(existing.credit) !== newValues.credit) {
            changeLines.push(`Credit: $${existing.credit} → $${newValues.credit}`)
          }
          if (Boolean(existing.not_to_exceed) !== newValues.not_to_exceed) {
            changeLines.push(`Not to Exceed: ${existing.not_to_exceed ? 'Yes' : 'No'} → ${newValues.not_to_exceed ? 'Yes' : 'No'}`)
          }
          if ((existing.spending_cap ?? null) !== (newValues.spending_cap ?? null)) {
            changeLines.push(`Spending Cap: ${existing.spending_cap ?? '—'} → ${newValues.spending_cap ?? '—'}`)
          }
          if ((existing.vendor_quote_number || '') !== (newValues.vendor_quote_number || '')) {
            changeLines.push(`Vendor Quote #: ${newValues.vendor_quote_number || '(cleared)'}`)
          }
          if (changeLines.length > 0) {
            await logPoActivity(requestId, changeLines.map((l) => `• ${l}`).join('\n'))
          }
        }

        const { error: delError } = await supabase
          .from('purchase_request_lines')
          .delete()
          .eq('purchase_request_id', requestId)
        if (delError) throw delError
      } else {
        const { data, error } = await supabase
          .from('purchase_requests')
          .insert({
            project_id: poDraftProjectId,
            sub_project_id: poDraftSubProjectId,
            vendor_id: poDraftVendorId,
            notes: poDraftNotes.trim() || null,
            description: poDraftDescription.trim() || null,
            budget_category_id: poDraftBudgetCategoryId,
            budget_subcategory_id: poDraftBudgetSubcategoryId,
            chargeable_expense: poDraftChargeableExpense,
            vendor_quote_number: poDraftVendorQuoteNumber.trim() || null,
            quote_file_url: quoteFileUrl,
            quote_file_name: quoteFileName,
            po_category: poDraftCategory,
            markup_rate: markupRateToSave,
            tax_rate: poDraftTaxRate === '' ? 13 : Number(poDraftTaxRate),
            shipping_handling: shippingToSave,
            credit: poDraftCredit === '' ? 0 : Number(poDraftCredit),
            not_to_exceed: notToExceedToSave,
            spending_cap: spendingCapToSave,
            currency: poDraftCurrency.trim() || 'CAD',
            status: 'draft',
            ticket_system_ticket_id: poDraftTicketSystemTicketId,
            ticket_system_ticket_number: poDraftTicketSystemTicketNumber,
          })
          .select()
          .single()
        if (error) throw error
        requestId = data.id
      }

      const { error: lineError } = await supabase.from('purchase_request_lines').insert(
        validLines.map((l) => ({
          purchase_request_id: requestId,
          line_type: l.line_type,
          part_gcs_id: l.line_type === 'part' ? l.part_gcs_id : null,
          description: (l.description || '').trim() || null,
          quantity: l.quantity === '' ? 1 : Number(l.quantity),
          unit_cost: l.unit_cost === '' ? null : Number(l.unit_cost),
        }))
      )
      if (lineError) throw lineError

      // The draft is already saved by now, so a failed invoice upload is
      // reported on its own instead of looking like the whole save failed.
      let invoiceFailed = false
      if (wantsInvoice) {
        try {
          await uploadAndInsertInvoice(requestId, {
            invoiceNumber: poDraftInvoiceNumber.trim(),
            amount: invoiceAmount,
            file: poDraftNewInvoiceFile,
          })
        } catch (invoiceError) {
          console.error(invoiceError)
          invoiceFailed = true
        }
      }

      closePoDraftForm()
      flashPoStatus(
        invoiceFailed
          ? 'Draft saved, but the invoice could not be attached — add it from the request instead.'
          : 'Draft saved.',
        !invoiceFailed
      )
      await refreshPurchaseRequest(requestId)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not save draft — check the console for details.', false)
    } finally {
      setSavingPoRequest(false)
    }
  }

  // Admin-only. Cascades to the request's own line items (on delete cascade),
  // but doesn't remove any uploaded receipt/invoice PDF from Storage -- those
  // just become unreferenced files there.
  async function handleDeletePurchaseRequest(request) {
    if (!isAdmin(loggedInUser)) return
    if (
      !window.confirm(
        `Delete ${request.po_number || `purchase request #${request.id}`}? This cannot be undone.`
      )
    ) {
      return
    }
    setPoActionBusyId(request.id)
    try {
      const { error } = await supabase.from('purchase_requests').delete().eq('id', request.id)
      if (error) throw error
      await Promise.all([
        ...(request.invoices || []).map((inv) => removeStorageFile('invoices', inv.file_url)),
        ...(request.receipts || []).map((r) => removeStorageFile('receipts', r.file_url)),
        removeStorageFile('quotes', request.quote_file_url),
        removeStorageFile('receipts', request.receipt_file_url),
      ])
      if (expandedPoId === request.id) setExpandedPoId(null)
      flashPoStatus('Purchase request deleted.', true)
      setPurchaseRequests((prev) => prev.filter((r) => r.id !== request.id))
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not delete — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleSubmitPurchaseRequest(request) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const { error } = await supabase
        .from('purchase_requests')
        .update({
          status: 'submitted',
          requested_by: loggedInUser.id,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      await logPoActivity(request.id, 'Submitted for approval')
      flashPoStatus('Request submitted.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not submit — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleApprovePurchaseRequest(request) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const { error } = await supabase
        .from('purchase_requests')
        .update({
          status: 'approved',
          approved_by: loggedInUser.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      await logPoActivity(request.id, 'Approved')
      flashPoStatus('Request approved.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not approve — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // Puts a submitted request on hold instead of approving it -- an
  // alternative to the approve decision, not a separate status, so it can be
  // resumed back to a normal pending-approval request with no history lost.
  async function handleHoldPurchaseRequest(request) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    const reason = window.prompt('Reason for putting this PO on hold (optional):')
    if (reason === null) return
    setPoActionBusyId(request.id)
    try {
      const { error } = await supabase
        .from('purchase_requests')
        .update({
          on_hold: true,
          hold_reason: reason.trim() || null,
          held_by: loggedInUser.id,
          held_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      await logPoActivity(request.id, reason.trim() ? `Put on hold: ${reason.trim()}` : 'Put on hold')
      flashPoStatus('Request put on hold.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not put the request on hold — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleResumeFromHold(request) {
    setPoActionBusyId(request.id)
    try {
      const { error } = await supabase
        .from('purchase_requests')
        .update({ on_hold: false, hold_reason: null, held_by: null, held_at: null })
        .eq('id', request.id)
      if (error) throw error
      await logPoActivity(request.id, 'Resumed from hold')
      flashPoStatus('Hold removed — back to pending approval.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not resume the request — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // PO numbers auto-generate as PO-{project_code}-{2-digit year}-{3-digit
  // seq}, e.g. "PO-06-26-001", independently per project and restarting at
  // 001 each new year. The sequence lives in its own append-only counter
  // (po_number_sequences) rather than being derived from existing PO
  // numbers, so deleting a PO never frees up its number for reuse. Falls
  // back to scanning existing po_number values only the first time a
  // project+year combination is seen (e.g. before the counter table has a
  // row for it), so already-issued numbers stay continuous. Ticket-system
  // tickets follow the same convention (TK- instead of PO-) using its own
  // per-project code -- see its lib/ticketNumber.ts.
  async function peekNextPoSeq(projectId, yearCode, prefix) {
    const { data: seqRow, error: seqError } = await supabase
      .from('po_number_sequences')
      .select('last_seq')
      .eq('project_id', projectId)
      .eq('year_code', yearCode)
      .maybeSingle()
    if (seqError) throw seqError
    if (seqRow) return seqRow.last_seq + 1

    const { data, error } = await supabase
      .from('purchase_requests')
      .select('po_number')
      .eq('project_id', projectId)
      .like('po_number', `%${prefix}%`)
    if (error) throw error
    let maxSeq = 0
    for (const row of data ?? []) {
      const match = row.po_number?.match(/-(\d{3})$/)
      if (match) maxSeq = Math.max(maxSeq, Number(match[1]))
    }
    return maxSeq + 1
  }

  async function computeNextPoNumber(request) {
    const project = projects.find((p) => p.id === request.project_id)
    const code = (project?.project_code || String(request.project_id)).trim().padStart(2, '0')
    const yy = String(new Date().getFullYear()).slice(-2)
    const prefix = `${code}-${yy}-`
    const seq = await peekNextPoSeq(request.project_id, yy, prefix)
    return `PO-${prefix}${String(seq).padStart(3, '0')}`
  }

  async function startIssuePurchaseOrder(request) {
    setIssuingRequestId(request.id)
    setPendingPoNumber(null)
    setComputingPoNumber(true)
    try {
      setPendingPoNumber(await computeNextPoNumber(request))
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not generate a PO number — check the console for details.', false)
      setIssuingRequestId(null)
    } finally {
      setComputingPoNumber(false)
    }
  }

  function cancelIssuePurchaseOrder() {
    setIssuingRequestId(null)
    setPendingPoNumber(null)
  }

  async function handleIssuePurchaseOrder(request) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    if (!pendingPoNumber) {
      flashPoStatus('PO number is not ready yet.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const yy = String(new Date().getFullYear()).slice(-2)
      const seqMatch = pendingPoNumber.match(/-(\d{3})$/)
      const seq = seqMatch ? Number(seqMatch[1]) : 1

      // Reserve the number for real now (read-then-write, same as the rest
      // of this app tolerates elsewhere) -- takes the higher of what's
      // already reserved and this preview's number, so it can only ever
      // move forward.
      const { data: existingSeqRow, error: seqReadError } = await supabase
        .from('po_number_sequences')
        .select('last_seq')
        .eq('project_id', request.project_id)
        .eq('year_code', yy)
        .maybeSingle()
      if (seqReadError) throw seqReadError

      const { error: seqWriteError } = await supabase.from('po_number_sequences').upsert(
        {
          project_id: request.project_id,
          year_code: yy,
          last_seq: Math.max(existingSeqRow?.last_seq ?? 0, seq),
        },
        { onConflict: 'project_id,year_code' }
      )
      if (seqWriteError) throw seqWriteError

      const { error } = await supabase
        .from('purchase_requests')
        .update({
          status: 'issued',
          issued_by: loggedInUser.id,
          issued_at: new Date().toISOString(),
          po_number: pendingPoNumber,
        })
        .eq('id', request.id)
      if (error) throw error
      setIssuingRequestId(null)
      const issuedNumber = pendingPoNumber
      setPendingPoNumber(null)
      await logPoActivity(request.id, `Issued as PO ${issuedNumber}`)
      flashPoStatus(`PO ${issuedNumber} issued.`, true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not issue PO — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // A plain dropdown -- no evidence file required for any transition. Moving
  // into the fully-done state for the first time ('received' for a Purchase
  // PO, 'complete' for a Service PO) also rolls the PO's part quantities
  // into stock (same effect the old photo-upload confirmation had, just
  // without requiring a file); re-selecting it after moving away would roll
  // stock in again, so this only fires on the actual transition into it.
  async function handleSetWorkStatus(request, workStatus) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    const fullyDoneValue = poCategory(request) === 'purchase' ? 'received' : 'complete'
    const enteringComplete = workStatus === fullyDoneValue && request.work_status !== fullyDoneValue
    setPoActionBusyId(request.id)
    try {
      // Belt-and-suspenders on top of the partLines check below: a Service
      // (or Not to Exceed) PO never has part lines by construction, but
      // gating on category too means a mislabeled/edited-after-the-fact row
      // still can't roll stock in or write a journal entry it shouldn't.
      if (enteringComplete && poCategory(request) === 'purchase') {
        const partLines = (request.purchase_request_lines || []).filter(
          (l) => l.line_type === 'part' && l.part_gcs_id
        )
        if (partLines.length > 0) {
          const gcsIds = [...new Set(partLines.map((l) => l.part_gcs_id))]
          const { data: existingStock, error: stockError } = await supabase
            .from('stock_on_hand')
            .select('project_id, part_gcs_id, quantity')
            .eq('project_id', request.project_id)
            .in('part_gcs_id', gcsIds)
          if (stockError) throw stockError

          const prevMap = new Map((existingStock ?? []).map((s) => [s.part_gcs_id, s.quantity]))
          const byPart = new Map()
          for (const line of partLines) {
            byPart.set(line.part_gcs_id, (byPart.get(line.part_gcs_id) ?? 0) + (Number(line.quantity) || 0))
          }

          const stockUpdates = [...byPart.entries()].map(([gcsId, qty]) => {
            const previous = prevMap.get(gcsId) ?? 0
            return { part_gcs_id: gcsId, previous, next: previous + qty }
          })

          const { error: upsertError } = await supabase
            .from('stock_on_hand')
            .upsert(
              stockUpdates.map((u) => ({
                project_id: request.project_id,
                part_gcs_id: u.part_gcs_id,
                quantity: u.next,
              })),
              { onConflict: 'project_id,part_gcs_id' }
            )
          if (upsertError) throw upsertError

          const vendorName = request.vendors?.name || 'Unknown Vendor'
          const { data: journalRow, error: journalError } = await supabase
            .from('inventory_journal')
            .insert({
              entry_type: 'po_received',
              note: `PO ${request.po_number || '#' + request.id} received from ${vendorName}`,
            })
            .select()
            .single()
          if (journalError) throw journalError

          const { error: lineError } = await supabase.from('inventory_journal_lines').insert(
            stockUpdates.map((u) => ({
              journal_id: journalRow.id,
              project_id: request.project_id,
              part_gcs_id: u.part_gcs_id,
              previous_quantity: u.previous,
              new_quantity: u.next,
            }))
          )
          if (lineError) throw lineError
        }
      }

      const payload = { work_status: workStatus }
      if (enteringComplete) {
        payload.received_by = loggedInUser.id
        payload.received_at = new Date().toISOString()
      }
      const { error } = await supabase.from('purchase_requests').update(payload).eq('id', request.id)
      if (error) throw error
      await logPoActivity(
        request.id,
        `PO Status: ${workStatusLabel(computeWorkStatus(request))} → ${workStatusLabel(workStatus)}`
      )
      flashPoStatus('Work status updated.', true)
      await Promise.all([refreshPurchaseRequest(request.id), loadStock()])
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update work status — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleSetPaymentStatus(request, paymentStatus) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    if (paymentStatus === 'paid' && !canMarkPaymentPaid(request)) {
      flashPoStatus('Every invoice must be marked paid first.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const { error } = await supabase
        .from('purchase_requests')
        .update({ payment_status: paymentStatus })
        .eq('id', request.id)
      if (error) throw error
      await logPoActivity(
        request.id,
        `Payment Status: ${paymentStatusLabel(computePaymentStatus(request))} → ${paymentStatusLabel(paymentStatus)}`
      )
      flashPoStatus('Payment status updated.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update payment status — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // Every uploaded PDF (invoice/receipt/quote) is stored as its Storage
  // object path plus a public URL built from it -- deleting the DB row that
  // references one doesn't remove the file itself, so every delete path
  // below also has to clean up its own Storage object. Failing to remove it
  // is logged but never blocks the delete the user actually asked for --
  // the DB row being gone is what matters to them.
  function storagePathFromPublicUrl(bucket, url) {
    if (!url) return null
    const marker = `/object/public/${bucket}/`
    const idx = url.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(url.slice(idx + marker.length))
  }

  async function removeStorageFile(bucket, url) {
    const path = storagePathFromPublicUrl(bucket, url)
    if (!path) return
    const { error } = await supabase.storage.from(bucket).remove([path])
    if (error) console.error(`Could not remove ${bucket}/${path} from storage:`, error)
  }

  // Shared by the Invoices panel (handleAddInvoice) and the invoice slot on
  // the purchase request form: uploads the PDF, inserts the invoices row and
  // logs it. Throws on failure -- callers do their own flash/refresh.
  async function uploadAndInsertInvoice(requestId, { invoiceNumber, amount, file, matchToReceiptId }) {
    const ext = file.name.split('.').pop() || 'pdf'
    const path = `po-${requestId}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(path, file, { contentType: 'application/pdf' })
    if (uploadError) throw uploadError
    const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(path)
    const { error } = await supabase.from('invoices').insert({
      purchase_request_id: requestId,
      invoice_number: invoiceNumber || null,
      amount,
      file_url: urlData.publicUrl,
      file_name: file.name,
      uploaded_by: loggedInUser.id,
      matched_receipt_id: matchToReceiptId || null,
    })
    if (error) throw error
    await logPoActivity(
      requestId,
      `Invoice added${invoiceNumber ? ` (#${invoiceNumber})` : ''}: $${amount.toFixed(2)}`
    )
  }

  // Accounting adds an invoice independently of, and in parallel with, the
  // requisitioner adding a receipt (handleAddReceipt below) -- neither
  // blocks the other. They start out unpaired; handleMatchInvoiceReceipt
  // pairs a specific invoice with a specific receipt afterward.
  async function handleAddInvoice(request, { invoiceNumber, amount, file, matchToReceiptId }) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    if (!file) {
      flashPoStatus('Please choose a PDF file.', false)
      return
    }
    if (file.type !== 'application/pdf') {
      flashPoStatus('Please choose a PDF file.', false)
      return
    }
    const numericAmount = Number(amount)
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      flashPoStatus('Please enter a valid invoice amount.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      await uploadAndInsertInvoice(request.id, {
        invoiceNumber,
        amount: numericAmount,
        file,
        matchToReceiptId,
      })
      flashPoStatus(matchToReceiptId ? 'Invoice added and matched.' : 'Invoice added.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not add the invoice — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleApproveInvoice(invoice, checked) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(invoice.purchase_request_id)
    try {
      const payload = checked
        ? { approved: true, approved_by: loggedInUser.id, approved_at: new Date().toISOString() }
        : { approved: false, approved_by: null, approved_at: null }
      const { error } = await supabase.from('invoices').update(payload).eq('id', invoice.id)
      if (error) throw error
      await logPoActivity(
        invoice.purchase_request_id,
        checked ? `Invoice approved${invoice.invoice_number ? ` (#${invoice.invoice_number})` : ''}` : 'Invoice approval cleared'
      )
      flashPoStatus(checked ? 'Invoice marked approved.' : 'Invoice approval cleared.', true)
      await refreshPurchaseRequest(invoice.purchase_request_id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update invoice approval — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handlePayInvoice(invoice, checked) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(invoice.purchase_request_id)
    try {
      const payload = checked
        ? { paid: true, paid_by: loggedInUser.id, paid_at: new Date().toISOString() }
        : { paid: false, paid_by: null, paid_at: null }
      const { error } = await supabase.from('invoices').update(payload).eq('id', invoice.id)
      if (error) throw error
      await logPoActivity(
        invoice.purchase_request_id,
        checked ? `Invoice marked paid${invoice.invoice_number ? ` (#${invoice.invoice_number})` : ''}` : 'Invoice paid status cleared'
      )
      flashPoStatus(checked ? 'Marked paid.' : 'Paid status cleared.', true)
      await refreshPurchaseRequest(invoice.purchase_request_id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update paid status — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleDeleteInvoice(invoice) {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return
    setPoActionBusyId(invoice.purchase_request_id)
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)
      if (error) throw error
      await removeStorageFile('invoices', invoice.file_url)
      await logPoActivity(
        invoice.purchase_request_id,
        `Invoice deleted${invoice.invoice_number ? ` (#${invoice.invoice_number})` : ''}`
      )
      flashPoStatus('Invoice deleted.', true)
      await refreshPurchaseRequest(invoice.purchase_request_id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not delete the invoice — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // The requisitioner (or, for a service PO, the PO's own vendor-user)
  // uploads proof of delivery/work independently of accounting's invoices --
  // purely a reconciliation document, with no stock-on-hand effect (that
  // stays tied to the separate Work Status "Complete" action above).
  async function handleAddReceipt(request, file, matchToInvoiceId) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    if (!file) return
    setPoActionBusyId(request.id)
    try {
      const ext = file.name.split('.').pop() || 'dat'
      const path = `po-${request.id}-receipt-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)
      const { data: inserted, error } = await supabase
        .from('receipts')
        .insert({
          purchase_request_id: request.id,
          file_url: urlData.publicUrl,
          file_name: file.name,
          uploaded_by: loggedInUser.id,
        })
        .select()
        .single()
      if (error) throw error
      if (matchToInvoiceId) {
        const { error: matchError } = await supabase
          .from('invoices')
          .update({ matched_receipt_id: inserted.id })
          .eq('id', matchToInvoiceId)
        if (matchError) throw matchError
      }
      await logPoActivity(request.id, matchToInvoiceId ? 'Receipt added and matched' : 'Receipt added')
      flashPoStatus(matchToInvoiceId ? 'Receipt added and matched.' : 'Receipt added.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not add the receipt — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleDeleteReceipt(receipt) {
    if (!window.confirm('Delete this receipt? This cannot be undone.')) return
    setPoActionBusyId(receipt.purchase_request_id)
    try {
      const { error } = await supabase.from('receipts').delete().eq('id', receipt.id)
      if (error) throw error
      await removeStorageFile('receipts', receipt.file_url)
      await logPoActivity(receipt.purchase_request_id, 'Receipt deleted')
      flashPoStatus('Receipt deleted.', true)
      await refreshPurchaseRequest(receipt.purchase_request_id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not delete the receipt — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // Pairs (or unpairs, when receiptId is null) a specific invoice with a
  // specific receipt -- gated by Invoice Matching, same as adding an
  // invoice. Approving that pair is a separate role (Invoice Approval)
  // handled by handleApproveInvoice above.
  async function handleMatchInvoiceReceipt(invoice, receiptId) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(invoice.purchase_request_id)
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ matched_receipt_id: receiptId })
        .eq('id', invoice.id)
      if (error) throw error
      flashPoStatus(receiptId ? 'Invoice matched to receipt.' : 'Match cleared.', true)
      await refreshPurchaseRequest(invoice.purchase_request_id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update the match — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // Gated by canClosePo -- the original requester, once work is complete and
  // every invoice is paid in full (accounting's sign-off already happened
  // via the invoice approve/pay steps above).
  async function handleClosePo(request) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const { error } = await supabase
        .from('purchase_requests')
        .update({ status: 'closed', closed_by: loggedInUser.id, closed_at: new Date().toISOString() })
        .eq('id', request.id)
      if (error) throw error
      await logPoActivity(request.id, 'Closed')
      flashPoStatus('PO closed.', true)
      await refreshPurchaseRequest(request.id)
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not close the PO — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // --- Users tab (admin-only) ---
  function flashUsersStatus(msg, ok) {
    setUsersStatus({ ok, msg })
    setTimeout(() => setUsersStatus(null), 3000)
  }

  function toggleDraftUserRole(index, role) {
    setDraftUsers((prev) =>
      prev.map((u, i) => {
        if (i !== index) return u
        const roles = u.roles || []
        return { ...u, roles: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role] }
      })
    )
  }

  function updateDraftUserField(index, field, value) {
    setDraftUsers((prev) => prev.map((u, i) => (i === index ? { ...u, [field]: value } : u)))
  }

  function toggleInviteRole(role) {
    setInviteRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  // Calls the /api/invite-user serverless function (holds the service-role
  // key server-side), which sets a real, working, randomly-generated
  // temporary password directly rather than sending a one-time link --
  // those links break whenever they're relayed through anything that
  // auto-previews URLs (Teams, Outlook, Slack...), since the preview
  // fetch itself silently consumes the one-time token before the person
  // ever clicks it. A plain temporary password has no such problem: it's
  // just text, safe to paste into any of those tools, and works the
  // instant the account is created -- they can change it themselves later
  // from the Change Password button once logged in.
  async function handleInviteUser() {
    const email = inviteEmail.trim()
    if (!email) {
      flashUsersStatus('An email is required.', false)
      return
    }
    setInviting(true)
    setInvitePassword(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email, roles: inviteRoles }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not invite user.')

      flashUsersStatus(
        body.reused
          ? `Password reset for ${email} — copy it below and send it to them.`
          : `Account created for ${email} — copy the temporary password below and send it to them.`,
        true
      )
      setInvitePassword(body.password || null)
      setInviteEmail('')
      setInviteRoles([])
      await loadUsers()
    } catch (error) {
      console.error(error)
      flashUsersStatus(error.message || 'Could not invite user — check the console for details.', false)
    } finally {
      setInviting(false)
    }
  }

  // New accounts are added via handleInviteUser (an email invite through
  // Supabase Auth) instead of typing a row + password here -- this only
  // saves role/active changes on people who already have an account.
  async function handleSaveUsers() {
    setSavingUsers(true)
    try {
      for (const row of draftUsers) {
        const { error } = await supabase
          .from('users')
          .update({ roles: row.roles || [], active: row.active })
          .eq('id', row.id)
        if (error) throw error

        // Full-replace the entity assignments for each entity-scoped role,
        // same "just overwrite it" approach as the roles array above.
        for (const role of ENTITY_SCOPED_ROLES) {
          const projectIds = row.entityAssignments?.[role] || []
          const { error: deleteError } = await supabase
            .from('user_role_entities')
            .delete()
            .eq('user_id', row.id)
            .eq('role', role)
          if (deleteError) throw deleteError
          if (projectIds.length > 0) {
            const { error: insertError } = await supabase
              .from('user_role_entities')
              .insert(projectIds.map((projectId) => ({ user_id: row.id, role, project_id: projectId })))
            if (insertError) throw insertError
          }
        }
      }

      flashUsersStatus('Changes saved.', true)
      await Promise.all([loadUsers(), loadUserRoleEntities()])
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not save — check the console for details.', false)
    } finally {
      setSavingUsers(false)
    }
  }

  // Soft-delete, not a real row delete: clears roles and deactivates, which
  // already blocks login here (loadUserForSession rejects inactive rows) and
  // on the ticket-system side (its own eligibility check re-runs live on
  // every login there, and its Sync also deactivates the matching account).
  // The row stays so old purchase requests still show who requested/approved
  // them. auth_user_id is left alone -- no need to touch their actual login
  // account, "active" already fully blocks it.
  async function handleDeleteUser(user) {
    if (user.id === loggedInUser?.id) {
      flashUsersStatus("You can't remove your own account.", false)
      return
    }
    if (!window.confirm(`Remove ${user.name} from Inventory? They'll lose access immediately.`)) {
      return
    }
    try {
      const { error } = await supabase
        .from('users')
        .update({ roles: [], active: false })
        .eq('id', user.id)
      if (error) throw error
      flashUsersStatus(`Removed ${user.name}.`, true)
      await loadUsers()
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not remove — check the console for details.', false)
    }
  }

  function addDraftBudgetCategoryRow() {
    setDraftBudgetCategories((prev) => [
      ...prev,
      { _existing: false, _tempId: crypto.randomUUID(), name: '' },
    ])
  }

  function removeDraftBudgetCategoryRow(index) {
    setDraftBudgetCategories((prev) => prev.filter((_, i) => i !== index))
  }

  function updateDraftBudgetCategoryField(index, field, value) {
    setDraftBudgetCategories((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  async function handleSaveBudgetCategories() {
    const newRows = draftBudgetCategories.filter((c) => !c._existing)
    for (const row of newRows) {
      if (!(row.name || '').trim()) {
        flashUsersStatus('Every new budget category needs a name.', false)
        return
      }
    }

    setSavingBudgetCategories(true)
    try {
      const existingRows = draftBudgetCategories.filter((c) => c._existing)
      for (const row of existingRows) {
        const orig = budgetCategories.find((c) => c.id === row.id)
        if (orig && orig.name !== row.name) {
          const { error } = await supabase
            .from('budget_categories')
            .update({ name: row.name.trim() })
            .eq('id', row.id)
          if (error) throw error
        }
      }

      if (newRows.length) {
        const { error } = await supabase
          .from('budget_categories')
          .insert(newRows.map((r) => ({ name: r.name.trim() })))
        if (error) throw error
      }

      flashUsersStatus('Changes saved.', true)
      await loadBudgetCategories()
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not save — check the console for details.', false)
    } finally {
      setSavingBudgetCategories(false)
    }
  }

  function addDraftBudgetSubcategoryRow() {
    setDraftBudgetSubcategories((prev) => [
      ...prev,
      {
        _existing: false,
        _tempId: crypto.randomUUID(),
        category_id: budgetCategories[0]?.id ?? null,
        name: '',
      },
    ])
  }

  function removeDraftBudgetSubcategoryRow(index) {
    setDraftBudgetSubcategories((prev) => prev.filter((_, i) => i !== index))
  }

  function updateDraftBudgetSubcategoryField(index, field, value) {
    setDraftBudgetSubcategories((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  async function handleSaveBudgetSubcategories() {
    const newRows = draftBudgetSubcategories.filter((c) => !c._existing)
    for (const row of newRows) {
      if (!(row.name || '').trim()) {
        flashUsersStatus('Every new sub-category needs a name.', false)
        return
      }
      if (!row.category_id) {
        flashUsersStatus('Every new sub-category needs a budget category.', false)
        return
      }
    }

    setSavingBudgetSubcategories(true)
    try {
      const existingRows = draftBudgetSubcategories.filter((c) => c._existing)
      for (const row of existingRows) {
        const orig = budgetSubcategories.find((c) => c.id === row.id)
        if (orig && (orig.name !== row.name || orig.category_id !== row.category_id)) {
          const { error } = await supabase
            .from('budget_subcategories')
            .update({ name: row.name.trim(), category_id: row.category_id })
            .eq('id', row.id)
          if (error) throw error
        }
      }

      if (newRows.length) {
        const { error } = await supabase.from('budget_subcategories').insert(
          newRows.map((r) => ({ name: r.name.trim(), category_id: r.category_id }))
        )
        if (error) throw error
      }

      flashUsersStatus('Changes saved.', true)
      await loadBudgetSubcategories()
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not save — check the console for details.', false)
    } finally {
      setSavingBudgetSubcategories(false)
    }
  }

  function addDraftSubProjectRow() {
    setDraftSubProjects((prev) => [
      ...prev,
      {
        _existing: false,
        _tempId: crypto.randomUUID(),
        project_id: projects[0]?.id ?? null,
        name: '',
      },
    ])
  }

  function removeDraftSubProjectRow(index) {
    setDraftSubProjects((prev) => prev.filter((_, i) => i !== index))
  }

  function updateDraftSubProjectField(index, field, value) {
    setDraftSubProjects((prev) => prev.map((sp, i) => (i === index ? { ...sp, [field]: value } : sp)))
  }

  async function handleSaveSubProjects() {
    const newRows = draftSubProjects.filter((sp) => !sp._existing)
    for (const row of newRows) {
      if (!(row.name || '').trim()) {
        flashUsersStatus('Every new project needs a name.', false)
        return
      }
      if (!row.project_id) {
        flashUsersStatus('Every new project needs an entity.', false)
        return
      }
    }

    setSavingSubProjects(true)
    try {
      const existingRows = draftSubProjects.filter((sp) => sp._existing)
      for (const row of existingRows) {
        const orig = subProjects.find((sp) => sp.id === row.id)
        if (orig && (orig.name !== row.name || orig.project_id !== row.project_id)) {
          const { error } = await supabase
            .from('sub_projects')
            .update({ name: row.name.trim(), project_id: row.project_id })
            .eq('id', row.id)
          if (error) throw error
        }
      }

      if (newRows.length) {
        const { error } = await supabase.from('sub_projects').insert(
          newRows.map((r) => ({ name: r.name.trim(), project_id: r.project_id }))
        )
        if (error) throw error
      }

      flashUsersStatus('Changes saved.', true)
      await loadSubProjects()
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not save — check the console for details.', false)
    } finally {
      setSavingSubProjects(false)
    }
  }

  function openNewVendorForm() {
    setEditingVendorId(null)
    setVendorFormName('')
    setVendorFormContact('')
    setVendorFormPhone('')
    setVendorFormEmail('')
    setVendorFormAddress('')
    setVendorFormNotes('')
    setShowVendorForm(true)
  }

  function openEditVendorForm(vendor) {
    setEditingVendorId(vendor.id)
    setVendorFormName(vendor.name || '')
    setVendorFormContact(vendor.contact_name || '')
    setVendorFormPhone(vendor.phone || '')
    setVendorFormEmail(vendor.email || '')
    setVendorFormAddress(vendor.address || '')
    setVendorFormNotes(vendor.notes || '')
    setShowVendorForm(true)
  }

  function closeVendorForm() {
    setShowVendorForm(false)
    setEditingVendorId(null)
  }

  async function handleSaveVendor() {
    if (!vendorFormName.trim()) {
      flashUsersStatus('Vendor name is required.', false)
      return
    }
    setSavingVendor(true)
    try {
      const payload = {
        name: vendorFormName.trim(),
        contact_name: vendorFormContact.trim() || null,
        phone: vendorFormPhone.trim() || null,
        email: vendorFormEmail.trim() || null,
        address: vendorFormAddress.trim() || null,
        notes: vendorFormNotes.trim() || null,
      }
      if (editingVendorId) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', editingVendorId)
        if (error) throw error
        flashUsersStatus('Vendor updated.', true)
      } else {
        const { error } = await supabase.from('vendors').insert(payload)
        if (error) throw error
        flashUsersStatus('Vendor added.', true)
      }
      closeVendorForm()
      await loadVendors()
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not save vendor — check the console for details.', false)
    } finally {
      setSavingVendor(false)
    }
  }

  // Checking "Logon" for a vendor auto-manages a matching row in `users`
  // behind the scenes — name = the vendor's email, role 'vendor', linked via
  // vendor_id — reusing the exact same login/session/permission machinery as
  // any other account instead of building a second one. That row is hidden
  // from the Admin > Users table since it's meant to be managed from here.
  // Enabling logon for the first time sends a real invite email (through
  // /api/invite-user) instead of setting a password by hand.
  async function handleUpdateVendorLogon(vendor, changes) {
    const logonEnabled = changes.logon_enabled ?? vendor.logon_enabled
    if (logonEnabled && !vendor.email) {
      flashUsersStatus('Vendor needs an email before enabling logon.', false)
      return
    }

    const existingUser = users.find((u) => u.vendor_id === vendor.id)

    try {
      if (changes.logon_enabled !== undefined) {
        const { error } = await supabase
          .from('vendors')
          .update({ logon_enabled: changes.logon_enabled })
          .eq('id', vendor.id)
        if (error) throw error
      }

      if (logonEnabled) {
        if (existingUser) {
          const { error } = await supabase
            .from('users')
            .update({ active: true, roles: ['vendor'], vendor_id: vendor.id })
            .eq('id', existingUser.id)
          if (error) throw error
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          const res = await fetch('/api/invite-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ email: vendor.email, roles: ['vendor'], vendor_id: vendor.id }),
          })
          const body = await res.json()
          if (!res.ok) throw new Error(body.error || 'Could not invite vendor.')
        }
      } else if (existingUser) {
        const { error } = await supabase.from('users').update({ active: false }).eq('id', existingUser.id)
        if (error) throw error
      }

      flashUsersStatus('Vendor logon updated.', true)
      await Promise.all([loadVendors(), loadUsers()])
    } catch (error) {
      console.error(error)
      flashUsersStatus(error.message || 'Could not update vendor logon — check the console for details.', false)
    }
  }

  async function handleAddProject() {
    if (!newProjectName.trim()) {
      flashUsersStatus('Entity name is required.', false)
      return
    }
    setAddingProject(true)
    try {
      const { error } = await supabase.from('projects').insert({ name: newProjectName.trim() })
      if (error) throw error
      setNewProjectName('')
      flashUsersStatus('Entity added.', true)
      await loadProjects()
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not add entity — check the console for details.', false)
    } finally {
      setAddingProject(false)
    }
  }

  async function handleUpdateProjectCode(projectId, code) {
    const trimmed = code.trim()
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, project_code: trimmed } : p)))
    const { error } = await supabase
      .from('projects')
      .update({ project_code: trimmed || null })
      .eq('id', projectId)
    if (error) {
      console.error(error)
      flashUsersStatus('Could not save entity code — check the console for details.', false)
      await loadProjects()
    }
  }

  // Guard the Users tab itself (not just the tab button) in case activeTab
  // ever gets set to 'users' some other way for a non-admin.
  useEffect(() => {
    if (activeTab === 'users' && !isAdmin(loggedInUser)) {
      setActiveTab('master')
    }
  }, [activeTab, loggedInUser])

  // A vendor-logon account only ever gets the Purchase Orders tab — guard
  // the content itself, not just the tab buttons, in case activeTab is
  // already on a hidden tab (e.g. right after logging in).
  useEffect(() => {
    if (isVendorUser(loggedInUser) && activeTab !== 'po') {
      setActiveTab('po')
    }
  }, [activeTab, loggedInUser])

  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim() !== '')
    if (active.length === 0) return parts
    return parts.filter((p) =>
      active.every(([field, v]) => {
        if (field === 'gcs_id') return String(p.gcs_id) === v.trim()
        return String(p[field] ?? '').toLowerCase().includes(v.trim().toLowerCase())
      })
    )
  }, [parts, filters])

  const gcsIdOptions = useMemo(
    () => [...parts].map((p) => p.gcs_id).sort((a, b) => a - b),
    [parts]
  )

  const rows = editMode ? draftParts : filtered

  if (authLoading) {
    return (
      <div className="wrap wrap-narrow">
        <h1>📦 Parts Master List</h1>
        <p className="sub">Loading…</p>
      </div>
    )
  }

  if (needsPasswordSetup) {
    return (
      <div className="wrap wrap-narrow">
        <h1>📦 Parts Master List</h1>
        <p className="sub">Set a password for your account to finish signing in.</p>
        <div className="card">
          <form onSubmit={handlePasswordSetup} className="add-form">
            <label htmlFor="setup_password">New password</label>
            <input
              id="setup_password"
              type="password"
              autoFocus
              placeholder="At least 8 characters"
              value={passwordSetupValue}
              onChange={(e) => setPasswordSetupValue(e.target.value)}
            />
            <label htmlFor="setup_password_confirm">Confirm password</label>
            <input
              id="setup_password_confirm"
              type="password"
              placeholder="Re-enter password"
              value={passwordSetupConfirm}
              onChange={(e) => setPasswordSetupConfirm(e.target.value)}
            />
            <button className="btn-primary" type="submit" disabled={passwordSetupBusy}>
              {passwordSetupBusy ? 'Saving…' : 'Set Password'}
            </button>
            {passwordSetupError && <div className="status err">{passwordSetupError}</div>}
          </form>
        </div>
      </div>
    )
  }

  if (!loggedInUser) {
    return (
      <div className="wrap wrap-narrow">
        <h1>📦 Parts Master List</h1>
        <p className="sub">Backed by Supabase — data lives in the cloud, not just this page.</p>
        <div className="card">
          <form onSubmit={handleLogin} className="add-form">
            <label htmlFor="login_name">Email</label>
            <input
              id="login_name"
              type="email"
              autoFocus
              placeholder="you@greatcirclesolar.com"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
            />
            <label htmlFor="login_password">Password</label>
            <input
              id="login_password"
              type="password"
              placeholder="Enter password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            <button className="btn-primary" type="submit" disabled={loginBusy}>
              {loginBusy ? 'Logging in…' : 'Log In'}
            </button>
            {loginError && <div className="status err">{loginError}</div>}
          </form>
        </div>
      </div>
    )
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  return (
    <div className="wrap">
      <h1>
        📦{' '}
        {activeTab === 'master'
          ? 'Parts Master List'
          : activeTab === 'projects'
          ? `Required Inventory — ${selectedProject?.name ?? ''}`
          : activeTab === 'stock'
          ? 'Inventory On Hand'
          : activeTab === 'users'
          ? 'Users'
          : 'Purchase Orders'}
      </h1>
      <p className="sub">Backed by Supabase — data lives in the cloud, not just this page.</p>

      <div className="tab-row">
        {!isVendorUser(loggedInUser) && (
          <>
            <button
              className={'tab-btn' + (activeTab === 'master' ? ' active' : '')}
              onClick={() => setActiveTab('master')}
            >
              Master List
            </button>
            <button
              className={'tab-btn' + (activeTab === 'projects' ? ' active' : '')}
              onClick={() => setActiveTab('projects')}
            >
              Required Inventory
            </button>
            <button
              className={'tab-btn' + (activeTab === 'stock' ? ' active' : '')}
              onClick={() => setActiveTab('stock')}
            >
              Inventory On Hand
            </button>
          </>
        )}
        <button
          className={'tab-btn' + (activeTab === 'po' ? ' active' : '')}
          onClick={() => setActiveTab('po')}
        >
          Purchase Orders
          {poAttentionCounts.total > 0 && <span className="nav-badge">{poAttentionCounts.total}</span>}
        </button>
        {isAdmin(loggedInUser) && (
          <button
            className={'tab-btn' + (activeTab === 'users' ? ' active' : '')}
            onClick={() => setActiveTab('users')}
          >
            Admin
          </button>
        )}
        <span style={{ flex: 1 }} />
        <GlobalSearch
          purchaseRequests={purchaseRequests}
          parts={parts}
          onSelectPo={(id) => {
            setActiveTab('po')
            setExpandedPoId(id)
            loadPoActivity(id)
          }}
          onSelectPart={(part) => {
            setActiveTab('master')
            setFilters((f) => ({ ...f, gcs_part_id: part.gcs_part_id || '' }))
          }}
        />
        <span className="sub" style={{ margin: 0, alignSelf: 'center' }}>
          {loggedInUser.name}
        </span>
        {canAccessTicketing(loggedInUser) && (
          <a
            className="btn-secondary"
            href={TICKETING_URL}
            target="_blank"
            rel="noreferrer"
            style={{ borderRadius: 8, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Ticketing ↗
          </a>
        )}
        <button className="btn-secondary" onClick={() => setShowChangePassword((v) => !v)}>
          Change Password
        </button>
        <button className="btn-secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>

      {showChangePassword && (
        <div className="card">
          <div className="card-header">
            <h2>Change Password</h2>
          </div>
          <form onSubmit={handleChangePassword} className="add-form">
            <label htmlFor="change_password_new">New password</label>
            <input
              id="change_password_new"
              type="password"
              autoFocus
              placeholder="At least 8 characters"
              value={changePasswordValue}
              onChange={(e) => setChangePasswordValue(e.target.value)}
            />
            <label htmlFor="change_password_confirm">Confirm password</label>
            <input
              id="change_password_confirm"
              type="password"
              placeholder="Re-enter password"
              value={changePasswordConfirm}
              onChange={(e) => setChangePasswordConfirm(e.target.value)}
            />
            <div className="form-actions">
              <button className="btn-primary" type="submit" disabled={changePasswordBusy}>
                {changePasswordBusy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowChangePassword(false)
                  setChangePasswordValue('')
                  setChangePasswordConfirm('')
                  setChangePasswordError(null)
                }}
                disabled={changePasswordBusy}
              >
                Cancel
              </button>
            </div>
            {changePasswordError && <div className="status err">{changePasswordError}</div>}
          </form>
        </div>
      )}

      {activeTab === 'master' && (
        <MasterListTab
          canEditInventory={canEditInventory(loggedInUser)}
          manufacturerOptions={manufacturerOptions}
          categoryOptions={categoryOptions}
          whereUsedOptions={whereUsedOptions}
          masterPanel={masterPanel}
          resetMasterPanel={resetMasterPanel}
          editMode={editMode}
          runAction={runAction}
          handleSaveEdits={handleSaveEdits}
          savingEdits={savingEdits}
          addDraftRow={addDraftRow}
          handleCancelEdits={handleCancelEdits}
          status={status}
          importErrors={importErrors}
          importPreview={importPreview}
          handleImportFileChange={handleImportFileChange}
          handleConfirmImport={handleConfirmImport}
          importing={importing}
          lastPartsUpdate={lastPartsUpdate}
          hasActiveFilter={hasActiveFilter}
          setFilters={setFilters}
          loadParts={loadParts}
          loading={loading}
          filters={filters}
          updateFilter={updateFilter}
          gcsIdOptions={gcsIdOptions}
          rows={rows}
          parts={parts}
          updateDraftField={updateDraftField}
          removeDraftRow={removeDraftRow}
        />
      )}

      {activeTab === 'projects' && (
        <RequiredInventoryTab
          canEditInventory={canEditInventory(loggedInUser)}
          projects={projects}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          projectEditMode={projectEditMode}
          runAction={runAction}
          savingProjectEdits={savingProjectEdits}
          handleSaveProjectEdits={handleSaveProjectEdits}
          projectEditFilter={projectEditFilter}
          setProjectEditFilter={setProjectEditFilter}
          handleCancelProjectEdits={handleCancelProjectEdits}
          projectStatus={projectStatus}
          projectLoading={projectLoading}
          visibleProjectItems={visibleProjectItems}
          projectViewFilter={projectViewFilter}
          setProjectViewFilter={setProjectViewFilter}
          gcsIdOptions={projectGcsIdOptions}
          visibleDraftProjectItems={visibleDraftProjectItems}
          draftProjectItems={draftProjectItems}
          updateProjectRequired={updateProjectRequired}
          updateProjectDraftField={updateProjectDraftField}
        />
      )}

      {activeTab === 'stock' && (
        <InventoryOnHandTab
          canEditInventory={canEditInventory(loggedInUser)}
          stockPanel={stockPanel}
          resetStockPanel={resetStockPanel}
          stockEditMode={stockEditMode}
          locationEditMode={locationEditMode}
          setStockPanel={setStockPanel}
          runAction={runAction}
          loadJournalEntries={loadJournalEntries}
          savingStockEdits={savingStockEdits}
          handleSaveStockEdits={handleSaveStockEdits}
          adjustNote={adjustNote}
          setAdjustNote={setAdjustNote}
          stockEditFilter={stockEditFilter}
          setStockEditFilter={setStockEditFilter}
          handleCancelStockEdits={handleCancelStockEdits}
          savingLocationEdits={savingLocationEdits}
          handleSaveLocationEdits={handleSaveLocationEdits}
          locationEditFilter={locationEditFilter}
          setLocationEditFilter={setLocationEditFilter}
          locationNote={locationNote}
          setLocationNote={setLocationNote}
          handleCancelLocationEdits={handleCancelLocationEdits}
          stockStatus={stockStatus}
          handleExportInventory={handleExportInventory}
          handleUploadFileChange={handleUploadFileChange}
          uploadErrors={uploadErrors}
          uploadPreview={uploadPreview}
          uploadNote={uploadNote}
          setUploadNote={setUploadNote}
          uploading={uploading}
          handleConfirmUpload={handleConfirmUpload}
          recordUseMode={recordUseMode}
          cancelRecordPartUse={cancelRecordPartUse}
          useNote={useNote}
          setUseNote={setUseNote}
          useQtyByPart={useQtyByPart}
          updateUseQty={updateUseQty}
          savingUsePartId={savingUsePartId}
          handleRecordPartUse={handleRecordPartUse}
          transferMode={transferMode}
          cancelStockTransfer={cancelStockTransfer}
          transferToProjectId={transferToProjectId}
          setTransferToProjectId={setTransferToProjectId}
          transferNote={transferNote}
          setTransferNote={setTransferNote}
          transferQtyByPart={transferQtyByPart}
          updateTransferQty={updateTransferQty}
          savingTransferPartId={savingTransferPartId}
          handleStockTransfer={handleStockTransfer}
          journalLoading={journalLoading}
          journalEntries={journalEntries}
          expandedJournalId={expandedJournalId}
          toggleJournalExpand={toggleJournalExpand}
          journalLines={journalLines}
          projects={projects}
          parts={parts}
          stockLoading={stockLoading}
          visibleDraftStockItems={visibleDraftStockItems}
          visibleDraftLocationItems={visibleDraftLocationItems}
          visibleStockItems={visibleStockItems}
          stockViewProjectId={stockViewProjectId}
          handleChangeStockViewProject={handleChangeStockViewProject}
          stockViewFilter={stockViewFilter}
          setStockViewFilter={setStockViewFilter}
          gcsIdOptions={stockGcsIdOptions}
          draftStockItems={draftStockItems}
          updateStockDraftField={updateStockDraftField}
          draftLocationItems={draftLocationItems}
          updateLocationDraftField={updateLocationDraftField}
        />
      )}

      {activeTab === 'po' && (
        <PurchaseOrdersTab
          loggedInUser={loggedInUserWithScopes}
          users={users}
          vendors={vendors}
          poStatus={poStatus}
          poStatusFilter={poStatusFilter}
          setPoStatusFilter={setPoStatusFilter}
          poProjectFilter={poProjectFilter}
          setPoProjectFilter={setPoProjectFilter}
          poView={poView}
          setPoView={setPoView}
          projects={projects}
          poLoading={poLoading}
          visiblePurchaseRequests={visiblePurchaseRequests}
          invoicesPendingApproval={invoicesPendingApproval}
          poAttentionCounts={poAttentionCounts}
          expandedPoId={expandedPoId}
          toggleExpandedPo={toggleExpandedPo}
          poActivity={poActivity}
          poActivityLoading={poActivityLoading}
          poFormOpen={poFormOpen}
          openPoDraftForm={openPoDraftForm}
          closePoDraftForm={closePoDraftForm}
          poDraftId={poDraftId}
          poDraftProjectId={poDraftProjectId}
          setPoDraftProjectId={setPoDraftProjectId}
          poDraftSubProjectId={poDraftSubProjectId}
          setPoDraftSubProjectId={setPoDraftSubProjectId}
          subProjects={subProjects}
          poDraftVendorId={poDraftVendorId}
          setPoDraftVendorId={setPoDraftVendorId}
          poDraftNotes={poDraftNotes}
          setPoDraftNotes={setPoDraftNotes}
          poDraftFieldErrors={poDraftFieldErrors}
          poDraftDescription={poDraftDescription}
          setPoDraftDescription={setPoDraftDescription}
          poDraftBudgetCategoryId={poDraftBudgetCategoryId}
          setPoDraftBudgetCategoryId={setPoDraftBudgetCategoryId}
          poDraftBudgetSubcategoryId={poDraftBudgetSubcategoryId}
          setPoDraftBudgetSubcategoryId={setPoDraftBudgetSubcategoryId}
          budgetCategories={budgetCategories}
          budgetSubcategories={budgetSubcategories}
          poDraftChargeableExpense={poDraftChargeableExpense}
          setPoDraftChargeableExpense={setPoDraftChargeableExpense}
          poDraftVendorQuoteNumber={poDraftVendorQuoteNumber}
          setPoDraftVendorQuoteNumber={setPoDraftVendorQuoteNumber}
          poDraftQuoteFileUrl={poDraftQuoteFileUrl}
          poDraftQuoteFileName={poDraftQuoteFileName}
          poDraftNewQuoteFile={poDraftNewQuoteFile}
          setPoDraftNewQuoteFile={setPoDraftNewQuoteFile}
          clearPoDraftQuoteFile={() => {
            setPoDraftQuoteFileUrl(null)
            setPoDraftQuoteFileName(null)
            setPoDraftNewQuoteFile(null)
          }}
          applyPdfReadToDraft={applyPdfReadToDraft}
          poDraftInvoiceNumber={poDraftInvoiceNumber}
          setPoDraftInvoiceNumber={setPoDraftInvoiceNumber}
          poDraftInvoiceAmount={poDraftInvoiceAmount}
          setPoDraftInvoiceAmount={setPoDraftInvoiceAmount}
          poDraftNewInvoiceFile={poDraftNewInvoiceFile}
          setPoDraftNewInvoiceFile={setPoDraftNewInvoiceFile}
          poDraftTicketSystemTicketId={poDraftTicketSystemTicketId}
          poDraftTicketSystemTicketNumber={poDraftTicketSystemTicketNumber}
          poDraftCategory={poDraftCategory}
          setPoDraftCategory={updatePoDraftCategory}
          poDraftMarkupRate={poDraftMarkupRate}
          setPoDraftMarkupRate={setPoDraftMarkupRate}
          poDraftTaxRate={poDraftTaxRate}
          setPoDraftTaxRate={setPoDraftTaxRate}
          poDraftShippingHandling={poDraftShippingHandling}
          setPoDraftShippingHandling={setPoDraftShippingHandling}
          poDraftCredit={poDraftCredit}
          setPoDraftCredit={setPoDraftCredit}
          poDraftNotToExceed={poDraftNotToExceed}
          setPoDraftNotToExceed={setPoDraftNotToExceed}
          poDraftSpendingCap={poDraftSpendingCap}
          setPoDraftSpendingCap={setPoDraftSpendingCap}
          poDraftCurrency={poDraftCurrency}
          setPoDraftCurrency={setPoDraftCurrency}
          poDraftLines={poDraftLines}
          handleAddPurchaseRequestLine={handleAddPurchaseRequestLine}
          handleRemovePurchaseRequestLine={handleRemovePurchaseRequestLine}
          updatePoDraftLineField={updatePoDraftLineField}
          parts={poEligibleParts}
          savingPoRequest={savingPoRequest}
          handleCreatePurchaseRequest={handleCreatePurchaseRequest}
          handleSubmitPurchaseRequest={handleSubmitPurchaseRequest}
          handleApprovePurchaseRequest={handleApprovePurchaseRequest}
          handleHoldPurchaseRequest={handleHoldPurchaseRequest}
          handleResumeFromHold={handleResumeFromHold}
          issuingRequestId={issuingRequestId}
          startIssuePurchaseOrder={startIssuePurchaseOrder}
          cancelIssuePurchaseOrder={cancelIssuePurchaseOrder}
          pendingPoNumber={pendingPoNumber}
          computingPoNumber={computingPoNumber}
          handleIssuePurchaseOrder={handleIssuePurchaseOrder}
          handleSetWorkStatus={handleSetWorkStatus}
          handleSetPaymentStatus={handleSetPaymentStatus}
          handleAddInvoice={handleAddInvoice}
          handleApproveInvoice={handleApproveInvoice}
          handlePayInvoice={handlePayInvoice}
          handleDeleteInvoice={handleDeleteInvoice}
          handleAddReceipt={handleAddReceipt}
          handleDeleteReceipt={handleDeleteReceipt}
          handleMatchInvoiceReceipt={handleMatchInvoiceReceipt}
          handleClosePo={handleClosePo}
          poActionBusyId={poActionBusyId}
          handleDeletePurchaseRequest={handleDeletePurchaseRequest}
        />
      )}

      {activeTab === 'users' && isAdmin(loggedInUser) && (
        <UsersTab
          draftUsers={draftUsers}
          usersStatus={usersStatus}
          updateDraftUserField={updateDraftUserField}
          toggleDraftUserRole={toggleDraftUserRole}
          updateDraftUserEntityAssignment={updateDraftUserEntityAssignment}
          savingUsers={savingUsers}
          handleSaveUsers={handleSaveUsers}
          handleDeleteUser={handleDeleteUser}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteRoles={inviteRoles}
          toggleInviteRole={toggleInviteRole}
          inviting={inviting}
          handleInviteUser={handleInviteUser}
          invitePassword={invitePassword}
          draftBudgetCategories={draftBudgetCategories}
          addDraftBudgetCategoryRow={addDraftBudgetCategoryRow}
          removeDraftBudgetCategoryRow={removeDraftBudgetCategoryRow}
          updateDraftBudgetCategoryField={updateDraftBudgetCategoryField}
          savingBudgetCategories={savingBudgetCategories}
          handleSaveBudgetCategories={handleSaveBudgetCategories}
          draftBudgetSubcategories={draftBudgetSubcategories}
          addDraftBudgetSubcategoryRow={addDraftBudgetSubcategoryRow}
          removeDraftBudgetSubcategoryRow={removeDraftBudgetSubcategoryRow}
          updateDraftBudgetSubcategoryField={updateDraftBudgetSubcategoryField}
          savingBudgetSubcategories={savingBudgetSubcategories}
          handleSaveBudgetSubcategories={handleSaveBudgetSubcategories}
          handleExportAdminData={handleExportAdminData}
          adminImportPanelOpen={adminImportPanelOpen}
          setAdminImportPanelOpen={setAdminImportPanelOpen}
          adminImportFileName={adminImportFileName}
          adminImportPreview={adminImportPreview}
          adminImportErrors={adminImportErrors}
          handleAdminImportFileChange={handleAdminImportFileChange}
          adminImporting={adminImporting}
          handleConfirmAdminImport={handleConfirmAdminImport}
          resetAdminImportPanel={resetAdminImportPanel}
          vendors={vendors}
          showVendorForm={showVendorForm}
          editingVendorId={editingVendorId}
          openNewVendorForm={openNewVendorForm}
          openEditVendorForm={openEditVendorForm}
          closeVendorForm={closeVendorForm}
          vendorFormName={vendorFormName}
          setVendorFormName={setVendorFormName}
          vendorFormContact={vendorFormContact}
          setVendorFormContact={setVendorFormContact}
          vendorFormPhone={vendorFormPhone}
          setVendorFormPhone={setVendorFormPhone}
          vendorFormEmail={vendorFormEmail}
          setVendorFormEmail={setVendorFormEmail}
          vendorFormAddress={vendorFormAddress}
          setVendorFormAddress={setVendorFormAddress}
          vendorFormNotes={vendorFormNotes}
          setVendorFormNotes={setVendorFormNotes}
          savingVendor={savingVendor}
          handleSaveVendor={handleSaveVendor}
          handleUpdateVendorLogon={handleUpdateVendorLogon}
          projects={projects}
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          addingProject={addingProject}
          handleAddProject={handleAddProject}
          handleUpdateProjectCode={handleUpdateProjectCode}
          draftSubProjects={draftSubProjects}
          addDraftSubProjectRow={addDraftSubProjectRow}
          removeDraftSubProjectRow={removeDraftSubProjectRow}
          updateDraftSubProjectField={updateDraftSubProjectField}
          savingSubProjects={savingSubProjects}
          handleSaveSubProjects={handleSaveSubProjects}
        />
      )}

    </div>
  )
}

export default App
