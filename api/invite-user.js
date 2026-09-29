import { createClient } from '@supabase/supabase-js'

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

  const { email, roles, vendor_id } = req.body || {}
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
    const origin = req.headers.origin || `https://${req.headers.host}`

    // If this email already has an auth account (e.g. re-enabling someone),
    // reuse it instead of erroring out.
    let authUserId
    const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail)

    // generateLink never actually emails anyone -- it just creates the auth
    // account (for a new invite) and hands back the raw action link, which
    // the admin then copies and sends however they want. This sidesteps
    // Supabase's own default email sending, which is unreliable without a
    // custom SMTP provider configured (see inviteUserByEmail's old
    // behaviour -- it reported success even when the email silently never
    // arrived). A new account gets an 'invite' link (sets their first
    // password); an existing one gets a 'recovery' link (resets it).
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: existing ? 'recovery' : 'invite',
      email: normalizedEmail,
      options: { redirectTo: origin },
    })
    if (linkError) throw linkError
    authUserId = existing ? existing.id : linkData.user.id
    const actionLink = linkData.properties?.action_link

    // Only write a `users` row for a brand-new account. Re-generating a link
    // for an existing one is just a password reset -- it must never touch
    // their existing roles/active/vendor_id, which the invite form doesn't
    // even show for someone who already has an account (it previously
    // stomped them back to whatever the form happened to have, e.g.
    // wiping an admin's roles to [] because none of the checkboxes were
    // ticked for what was meant to be a no-op reset).
    if (!existing) {
      const { error: insertError } = await admin.from('users').insert({
        auth_user_id: authUserId,
        name: normalizedEmail,
        roles: roles || [],
        active: true,
        vendor_id: vendor_id ?? null,
      })
      if (insertError) throw insertError
    }

    res.status(200).json({ ok: true, link: actionLink, reused: Boolean(existing) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: error.message || 'Could not invite user.' })
  }
}
