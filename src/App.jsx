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
  linesAreMixedType,
  poLineType,
  TICKETING_URL,
} from './utils'
import MasterListTab from './tabs/MasterListTab'
import RequiredInventoryTab from './tabs/RequiredInventoryTab'
import InventoryOnHandTab from './tabs/InventoryOnHandTab'
import PurchaseOrdersTab from './tabs/PurchaseOrdersTab'
import UsersTab from './tabs/UsersTab'

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
  const [vendors, setVendors] = useState([])
  const [purchaseRequests, setPurchaseRequests] = useState([])
  const [poLoading, setPoLoading] = useState(true)
  const [poStatus, setPoStatus] = useState(null)

  const [poStatusFilter, setPoStatusFilter] = useState('')
  const [poProjectFilter, setPoProjectFilter] = useState('')
  const [expandedPoId, setExpandedPoId] = useState(null)
  const [poActionBusyId, setPoActionBusyId] = useState(null)

  const [poFormOpen, setPoFormOpen] = useState(false)
  const [poDraftId, setPoDraftId] = useState(null)
  const [poDraftProjectId, setPoDraftProjectId] = useState(null)
  const [poDraftVendorId, setPoDraftVendorId] = useState(null)
  const [poDraftNotes, setPoDraftNotes] = useState('')
  const [poDraftDescription, setPoDraftDescription] = useState('')
  const [poDraftChargeableExpense, setPoDraftChargeableExpense] = useState(false)
  const [poDraftVendorQuoteNumber, setPoDraftVendorQuoteNumber] = useState('')
  const [poDraftMarkupRate, setPoDraftMarkupRate] = useState('10')
  const [poDraftTaxRate, setPoDraftTaxRate] = useState('13')
  const [poDraftShippingHandling, setPoDraftShippingHandling] = useState('0')
  const [poDraftCredit, setPoDraftCredit] = useState('0')
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

  // The Admin tab's Users table is always directly editable (it's already
  // gated to admins only) — this keeps the on-screen draft in sync with
  // whatever was last loaded from the server, so edits start from a clean
  // baseline after every save/reload. Vendor-logon accounts (vendor_id set)
  // are managed from the Vendors table instead, so they're excluded here.
  useEffect(() => {
    setDraftUsers(users.filter((u) => !u.vendor_id).map((u) => ({ ...u, _existing: true })))
  }, [users])

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

  async function loadPurchaseRequests() {
    setPoLoading(true)
    const { data, error } = await supabase
      .from('purchase_requests')
      .select(
        '*, purchase_request_lines(*, parts(*)), projects(*), sub_projects(*), vendors(*), budget_categories(*), budget_subcategories(*)'
      )
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

  useEffect(() => {
    if (loggedInUser) {
      loadUsers()
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
      await loadUserForSession(session)
    } catch (error) {
      console.error(error)
      setPasswordSetupError('Could not set password — check the console for details.')
    } finally {
      setPasswordSetupBusy(false)
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
      'Ticket/Purchase Req': u.roles?.includes('purchase_req') ? 'Yes' : '',
      Approve: u.roles?.includes('approve') ? 'Yes' : '',
      Receive: u.roles?.includes('receive') ? 'Yes' : '',
      Accounting: u.roles?.includes('accounting') ? 'Yes' : '',
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
      if (truthyCsvFlag(getCell(row, 'Ticket/Purchase Req'))) roles.push('purchase_req')
      if (truthyCsvFlag(getCell(row, 'Approve'))) roles.push('approve')
      if (truthyCsvFlag(getCell(row, 'Receive'))) roles.push('receive')
      if (truthyCsvFlag(getCell(row, 'Accounting'))) roles.push('accounting')
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
          .insert({ entry_type: 'adjustment', note: locationNote.trim() })
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
        .insert({ entry_type: 'adjustment', note: `Part use: ${useNote.trim()}` })
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
    const toCurrent = item?.perProject?.[transferToProjectId]?.onHand ?? 0
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
          entry_type: 'adjustment',
          note: `Stock transfer: ${transferNote.trim()} (${fromProjectName} → ${toProjectName})`,
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

  const visiblePurchaseRequests = useMemo(() => {
    let list = purchaseRequests
    // A vendor-logon account only ever sees their own vendor's actual POs —
    // once a PO number has been issued, not drafts/requisitions/approvals.
    if (isVendorUser(loggedInUser)) {
      list = list.filter(
        (r) =>
          r.vendor_id === loggedInUser.vendor_id && (r.status === 'issued' || r.status === 'received')
      )
    }
    if (poStatusFilter) list = list.filter((r) => r.status === poStatusFilter)
    if (poProjectFilter) list = list.filter((r) => String(r.project_id) === poProjectFilter)
    return list
  }, [purchaseRequests, poStatusFilter, poProjectFilter, loggedInUser])

  function toggleExpandedPo(id) {
    setExpandedPoId((prev) => (prev === id ? null : id))
  }

  const poEligibleParts = useMemo(
    () => parts.filter((p) => poDraftEligiblePartIds.has(p.gcs_id)),
    [parts, poDraftEligiblePartIds]
  )

  function openPoDraftForm(existing, prefill) {
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
      setPoDraftMarkupRate('10')
      setPoDraftTaxRate('13')
      setPoDraftShippingHandling('0')
      setPoDraftCredit('0')
      setPoDraftCurrency('CAD')
      setPoDraftLines([blankPurchaseRequestLine()])
    }
    setPoDraftFieldErrors({})
    setPoFormOpen(true)
  }

  function closePoDraftForm() {
    setPoFormOpen(false)
    setPoDraftId(null)
    setPoDraftLines([])
    setPoDraftFieldErrors({})
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
    // A PO is entirely parts or entirely a service — a new line always
    // matches whatever the first line already established.
    setPoDraftLines((prev) => [...prev, blankPurchaseRequestLine(prev[0]?.line_type ?? 'part')])
  }

  function handleRemovePurchaseRequestLine(index) {
    setPoDraftLines((prev) => prev.filter((_, i) => i !== index))
  }

  function updatePoDraftLineField(index, field, value) {
    // A PO is entirely parts or entirely a service — changing the first
    // line's type changes it for every line, so there's only ever one type
    // selector shown to the user (on the first line).
    if (field === 'line_type' && index === 0) {
      setPoDraftLines((prev) => prev.map((l) => ({ ...l, line_type: value })))
      return
    }
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

  async function handleCreatePurchaseRequest() {
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
    setPoDraftFieldErrors({})

    setSavingPoRequest(true)
    try {
      let requestId = poDraftId
      if (requestId) {
        const { error } = await supabase
          .from('purchase_requests')
          .update({
            project_id: poDraftProjectId,
            sub_project_id: poDraftSubProjectId,
            vendor_id: poDraftVendorId,
            notes: poDraftNotes.trim() || null,
            description: poDraftDescription.trim() || null,
            budget_category_id: poDraftBudgetCategoryId,
            budget_subcategory_id: poDraftBudgetSubcategoryId,
            chargeable_expense: poDraftChargeableExpense,
            vendor_quote_number: poDraftVendorQuoteNumber.trim() || null,
            markup_rate: poDraftMarkupRate === '' ? 10 : Number(poDraftMarkupRate),
            tax_rate: poDraftTaxRate === '' ? 13 : Number(poDraftTaxRate),
            shipping_handling: poDraftShippingHandling === '' ? 0 : Number(poDraftShippingHandling),
            credit: poDraftCredit === '' ? 0 : Number(poDraftCredit),
            currency: poDraftCurrency.trim() || 'CAD',
          })
          .eq('id', requestId)
        if (error) throw error

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
            markup_rate: poDraftMarkupRate === '' ? 10 : Number(poDraftMarkupRate),
            tax_rate: poDraftTaxRate === '' ? 13 : Number(poDraftTaxRate),
            shipping_handling: poDraftShippingHandling === '' ? 0 : Number(poDraftShippingHandling),
            credit: poDraftCredit === '' ? 0 : Number(poDraftCredit),
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

      closePoDraftForm()
      flashPoStatus('Draft saved.', true)
      await loadPurchaseRequests()
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
      if (expandedPoId === request.id) setExpandedPoId(null)
      flashPoStatus('Purchase request deleted.', true)
      await loadPurchaseRequests()
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
      flashPoStatus('Request submitted.', true)
      await loadPurchaseRequests()
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
      flashPoStatus('Request approved.', true)
      await loadPurchaseRequests()
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not approve — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // PO numbers auto-generate as PO-{project_code}-{2-digit year}-{3-digit
  // seq}, e.g. "PO-06-26-001" — the sequence is derived from existing PO
  // numbers for that project+prefix (not a separate counter), so it
  // naturally restarts at 001 each new year and counts independently per
  // project. Ticket-system tickets follow the same convention (TK- instead
  // of PO-) using its own per-project code -- see its lib/ticketNumber.ts.
  async function computeNextPoNumber(request) {
    const project = projects.find((p) => p.id === request.project_id)
    const code = (project?.project_code || String(request.project_id)).trim().padStart(2, '0')
    const yy = String(new Date().getFullYear()).slice(-2)
    const prefix = `${code}-${yy}-`
    const { data, error } = await supabase
      .from('purchase_requests')
      .select('po_number')
      .eq('project_id', request.project_id)
      .like('po_number', `%${prefix}%`)
    if (error) throw error
    let maxSeq = 0
    for (const row of data ?? []) {
      const match = row.po_number?.match(/-(\d{3})$/)
      if (match) maxSeq = Math.max(maxSeq, Number(match[1]))
    }
    return `PO-${prefix}${String(maxSeq + 1).padStart(3, '0')}`
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
      flashPoStatus(`PO ${issuedNumber} issued.`, true)
      await loadPurchaseRequests()
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not issue PO — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // Confirming receipt (parts) or completion (service) now requires
  // uploading evidence — a photo/packing-slip for parts, or the service
  // report PDF for a service PO — rather than just clicking a button. The
  // stock/journal update logic is unchanged; it only ever applies to part
  // lines, which a service PO has none of.
  async function handleUploadReceiptAndConfirm(request, file) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    if (!file) return
    const isService = poLineType(request) === 'service'
    if (isService && file.type !== 'application/pdf') {
      flashPoStatus('Please choose a PDF service report.', false)
      return
    }
    if (!isService && !file.type.startsWith('image/') && file.type !== 'application/pdf') {
      flashPoStatus('Please choose a photo or PDF.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const ext = file.name.split('.').pop() || 'dat'
      const path = `po-${request.id}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path)

      const partLines = (request.purchase_request_lines || []).filter(
        (l) => l.line_type === 'part' && l.part_gcs_id
      )
      let stockUpdates = []

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

        stockUpdates = [...byPart.entries()].map(([gcsId, qty]) => {
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
            entry_type: 'adjustment',
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

      const { error } = await supabase
        .from('purchase_requests')
        .update({
          status: 'received',
          received_by: loggedInUser.id,
          received_at: new Date().toISOString(),
          receipt_file_url: urlData.publicUrl,
          receipt_file_name: file.name,
        })
        .eq('id', request.id)
      if (error) throw error

      flashPoStatus(
        isService ? 'Marked complete — service report uploaded.' : 'Marked received — inventory updated.',
        true
      )
      await Promise.all([loadPurchaseRequests(), loadStock()])
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not confirm — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  // Matching an invoice now requires actually uploading the PDF, not just
  // ticking a box — the file goes to the public "invoices" Storage bucket
  // and its URL/name are saved alongside the usual by/at attribution.
  async function handleUploadInvoiceAndMatch(request, file) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    if (!file) return
    if (file.type !== 'application/pdf') {
      flashPoStatus('Please choose a PDF file.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `po-${request.id}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(path, file, { contentType: 'application/pdf' })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(path)
      const payload = {
        invoice_matched: true,
        invoice_matched_by: loggedInUser.id,
        invoice_matched_at: new Date().toISOString(),
        invoice_file_url: urlData.publicUrl,
        invoice_file_name: file.name,
      }
      const { error } = await supabase.from('purchase_requests').update(payload).eq('id', request.id)
      if (error) throw error
      flashPoStatus('Invoice uploaded and marked matched.', true)
      await loadPurchaseRequests()
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not upload the invoice — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleToggleInvoiceMatched(request, checked) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const payload = checked
        ? {
            invoice_matched: true,
            invoice_matched_by: loggedInUser.id,
            invoice_matched_at: new Date().toISOString(),
          }
        : {
            invoice_matched: false,
            invoice_matched_by: null,
            invoice_matched_at: null,
            invoice_file_url: null,
            invoice_file_name: null,
          }
      const { error } = await supabase.from('purchase_requests').update(payload).eq('id', request.id)
      if (error) throw error
      flashPoStatus(checked ? 'Invoice marked matched.' : 'Invoice match cleared.', true)
      await loadPurchaseRequests()
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update invoice match — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleToggleInvoiceApproved(request, checked) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const payload = checked
        ? {
            invoice_approved: true,
            invoice_approved_by: loggedInUser.id,
            invoice_approved_at: new Date().toISOString(),
          }
        : { invoice_approved: false, invoice_approved_by: null, invoice_approved_at: null }
      const { error } = await supabase.from('purchase_requests').update(payload).eq('id', request.id)
      if (error) throw error
      flashPoStatus(checked ? 'Invoice marked approved.' : 'Invoice approval cleared.', true)
      await loadPurchaseRequests()
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update invoice approval — check the console for details.', false)
    } finally {
      setPoActionBusyId(null)
    }
  }

  async function handleTogglePaid(request, checked) {
    if (!loggedInUser) {
      flashPoStatus('You must be logged in.', false)
      return
    }
    setPoActionBusyId(request.id)
    try {
      const payload = checked
        ? { paid: true, paid_by: loggedInUser.id, paid_at: new Date().toISOString() }
        : { paid: false, paid_by: null, paid_at: null }
      const { error } = await supabase.from('purchase_requests').update(payload).eq('id', request.id)
      if (error) throw error
      flashPoStatus(checked ? 'Marked paid.' : 'Paid status cleared.', true)
      await loadPurchaseRequests()
    } catch (error) {
      console.error(error)
      flashPoStatus('Could not update paid status — check the console for details.', false)
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
  // key server-side) which sends a real Supabase Auth invite email and links
  // a matching `users` row once accepted.
  async function handleInviteUser() {
    const email = inviteEmail.trim()
    if (!email) {
      flashUsersStatus('An email is required.', false)
      return
    }
    setInviting(true)
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

      flashUsersStatus(`Invite sent to ${email}.`, true)
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
      }

      flashUsersStatus('Changes saved.', true)
      await loadUsers()
    } catch (error) {
      console.error(error)
      flashUsersStatus('Could not save — check the console for details.', false)
    } finally {
      setSavingUsers(false)
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
        <button className="btn-secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>

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
          setStockViewProjectId={setStockViewProjectId}
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
          loggedInUser={loggedInUser}
          users={users}
          vendors={vendors}
          poStatus={poStatus}
          poStatusFilter={poStatusFilter}
          setPoStatusFilter={setPoStatusFilter}
          poProjectFilter={poProjectFilter}
          setPoProjectFilter={setPoProjectFilter}
          projects={projects}
          poLoading={poLoading}
          visiblePurchaseRequests={visiblePurchaseRequests}
          expandedPoId={expandedPoId}
          toggleExpandedPo={toggleExpandedPo}
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
          poDraftTicketSystemTicketId={poDraftTicketSystemTicketId}
          poDraftTicketSystemTicketNumber={poDraftTicketSystemTicketNumber}
          poDraftMarkupRate={poDraftMarkupRate}
          setPoDraftMarkupRate={setPoDraftMarkupRate}
          poDraftTaxRate={poDraftTaxRate}
          setPoDraftTaxRate={setPoDraftTaxRate}
          poDraftShippingHandling={poDraftShippingHandling}
          setPoDraftShippingHandling={setPoDraftShippingHandling}
          poDraftCredit={poDraftCredit}
          setPoDraftCredit={setPoDraftCredit}
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
          issuingRequestId={issuingRequestId}
          startIssuePurchaseOrder={startIssuePurchaseOrder}
          cancelIssuePurchaseOrder={cancelIssuePurchaseOrder}
          pendingPoNumber={pendingPoNumber}
          computingPoNumber={computingPoNumber}
          handleIssuePurchaseOrder={handleIssuePurchaseOrder}
          handleUploadReceiptAndConfirm={handleUploadReceiptAndConfirm}
          handleUploadInvoiceAndMatch={handleUploadInvoiceAndMatch}
          handleToggleInvoiceMatched={handleToggleInvoiceMatched}
          handleToggleInvoiceApproved={handleToggleInvoiceApproved}
          handleTogglePaid={handleTogglePaid}
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
          savingUsers={savingUsers}
          handleSaveUsers={handleSaveUsers}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteRoles={inviteRoles}
          toggleInviteRole={toggleInviteRole}
          inviting={inviting}
          handleInviteUser={handleInviteUser}
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
