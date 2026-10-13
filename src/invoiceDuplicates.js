import { supabase } from './supabaseClient'

// Duplicate-invoice check (add_invoice_duplicate_guard.sql). Asks the database for this vendor's
// invoices, on any PO, with the same number (ignoring case and punctuation) or the same amount in
// the last 90 days. `ready` is false until that SQL has been run, so the caller can fall back to
// its own same-PO check. The same-number rule is also enforced by a trigger.

// How much of a reason counts, matching the trigger.
export const MIN_DUPLICATE_REASON = 5

// A same-number match that has to be explained before the invoice can be added. Invoices on a
// voided PO don't count (the trigger ignores them too).
export const isBlockingDuplicate = (m) => m.same_number && m.po_status !== 'voided'

export async function findDuplicateInvoices({ vendorId, number, amount }) {
  const n = Number(amount)
  const hasNumber = Boolean((number || '').replace(/[^a-z0-9]/gi, ''))
  const hasAmount = amount !== '' && amount != null && !Number.isNaN(n) && n > 0
  if (!vendorId || (!hasNumber && !hasAmount)) return { ready: true, matches: [] }
  try {
    const { data, error } = await supabase.rpc('fn_find_duplicate_invoices', {
      p_vendor_id: vendorId,
      p_number: hasNumber ? number : null,
      p_amount: hasAmount ? n : null,
    })
    if (error) throw error
    return { ready: true, matches: data || [] }
  } catch (error) {
    console.warn('Duplicate invoice check unavailable (add_invoice_duplicate_guard.sql not run yet?):', error)
    return { ready: false, matches: [] }
  }
}
