import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// A short, easy-to-copy random temporary password -- not meant to be typed
// by hand, just pasted wherever (Teams, Outlook, a text message...) without
// tripping any of the link-preview/one-time-token problems a real invite
// link has. Base64url so it's plain alphanumerics (plus - and _), no
// characters that could get mangled or need escaping in transit.
function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64url')
}

// Server-only keys -- never exposed to the browser bundle since this file
// only ever runs on Vercel, not in Vite's client build. Set these in the
// Vercel project's Environment Variables (not the VITE_ prefixed ones).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    res.status(500).json({ error: 'Server is missing Supabase configuration.' })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' })
    return
  }

  const { email, roles, vendor_id, display_name } = req.body || {}
  // Optional friendly name; only written when one is given, so inviting
  // someone without it never depends on the display_name column existing.
  const displayName = typeof display_name === 'string' && display_name.trim() ? display_name.trim() : null
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'A valid email is required.' })
    return
  }

  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    // Confirm the caller is themselves a signed-in, active admin -- this
    // endpoint holds the service-role key, so it must gate itself.
    const { data: callerAuth, error: callerAuthError } = await anonClient.auth.getUser(token)
    if (callerAuthError || !callerAuth?.user) {
      res.status(401).json({ error: 'Invalid session.' })
      return
    }

    const { data: callerRow, error: callerRowError } = await admin
      .from('users')
      .select('roles, active')
      .eq('auth_user_id', callerAuth.user.id)
      .maybeSingle()
    if (callerRowError || !callerRow?.active || !(callerRow.roles || []).includes('admin')) {
      res.status(403).json({ error: 'Only an admin can invite new users.' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    // If this email already has an auth account (e.g. re-enabling someone,
    // or they forgot their password), reuse it instead of erroring out.
    const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail)

    // Sets a real, working password directly rather than emailing/linking
    // one -- see handleInviteUser in App.jsx for why: a one-time link
    // breaks the moment it's relayed through Teams/Outlook/Slack, since
    // their automatic link-preview fetch silently consumes the token
    // before the person ever clicks it. A plain temporary password has no
    // such failure mode and works immediately.
    const tempPassword = generateTempPassword()
    let authUserId

    if (existing) {
      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
      })
      if (updateError) throw updateError
      authUserId = existing.id
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
      })
      if (createError) throw createError
      authUserId = created.user.id
    }

    if (!existing) {
      // Brand-new account: create the matching `users` row. Fully active
      // right away -- the password above already works -- but
      // activated_at stays null until they change it themselves, so the
      // Users tab can flag anyone still sitting on an admin-set password.
      const { error: insertError } = await admin.from('users').insert({
        auth_user_id: authUserId,
        name: normalizedEmail,
        roles: roles || [],
        active: true,
        vendor_id: vendor_id ?? null,
        ...(displayName ? { display_name: displayName } : {}),
      })
      if (insertError) throw insertError
    } else {
      // Existing account: never touch roles/active/vendor_id here (this
      // form doesn't even show them for someone who already has an
      // account) -- just mark them back to "on a temporary password" since
      // that's what resetting it just made true again.
      const { error: resetError } = await admin
        .from('users')
        .update({ activated_at: null, ...(displayName ? { display_name: displayName } : {}) })
        .eq('auth_user_id', authUserId)
      if (resetError) throw resetError
    }

    res.status(200).json({ ok: true, password: tempPassword, reused: Boolean(existing) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: error.message || 'Could not invite user.' })
  }
}
