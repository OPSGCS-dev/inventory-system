// What a vendor record holds, in one place: the form, the Excel import / export and the printed PO all go through
// these. The database columns are listed in supabase/add_vendor_details.sql.
//
// Form keys (what the Vendors form and the "Request a new vendor" panel keep in state):
//   name, code, legal, contact, phone, mobile, email, altEmail, website,
//   address1, address2, city, region, postal, country, notes

export const EMPTY_VENDOR_FORM = {
  name: '', code: '', legal: '', contact: '', phone: '', mobile: '', email: '', altEmail: '', website: '',
  address1: '', address2: '', city: '', region: '', postal: '', country: '', notes: '',
}

// Form key -> database column, for the fields that need vendor_details.sql to be run first.
export const DETAIL_COLUMNS = {
  code: 'vendor_code',
  legal: 'legal_name',
  mobile: 'mobile',
  altEmail: 'alt_email',
  website: 'website',
  address2: 'address_line2',
  city: 'city',
  region: 'region',
  postal: 'postal_code',
  country: 'country',
}

const text = (value) => String(value ?? '').trim()

// Lowercase letters and digits only, so "Fence and Deckman" and "FENCE & DECKMAN, Inc" can be compared. Used to
// recognise a vendor in an imported list.
export const vendorNameKey = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '')

// The vendor's name as it should be printed: the legal name when there is one.
export const vendorLegalName = (vendor) => text(vendor?.legal_name) || text(vendor?.name)

// The address as lines, for the PO. `address` may be a whole older multi-line address; the other parts add to it.
// Canada is left off (the PO is a Canadian document); any other country is shown.
export function vendorAddressLines(vendor) {
  if (!vendor) return []
  const cityLine = [text(vendor.city), [text(vendor.region), text(vendor.postal_code)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
  const country = text(vendor.country)
  return [
    ...String(vendor.address ?? '').split('\n').map(text),
    text(vendor.address_line2),
    cityLine,
    country && country.toLowerCase() !== 'canada' ? country : '',
  ].filter(Boolean)
}

export const vendorAddressText = (vendor, separator = ', ') => vendorAddressLines(vendor).join(separator)

// A vendor row -> form state (all strings). An older multi-line address is flattened onto one line.
export function vendorFormFromVendor(vendor) {
  const v = vendor || {}
  return {
    name: v.name || '',
    code: v.vendor_code || '',
    legal: v.legal_name || '',
    contact: v.contact_name || '',
    phone: v.phone || '',
    mobile: v.mobile || '',
    email: v.email || '',
    altEmail: v.alt_email || '',
    website: v.website || '',
    address1: String(v.address || '').split('\n').map(text).filter(Boolean).join(', '),
    address2: v.address_line2 || '',
    city: v.city || '',
    region: v.region || '',
    postal: v.postal_code || '',
    country: v.country || '',
    notes: v.notes || '',
  }
}

// Form state -> columns to save. `detailsReady` = add_vendor_details.sql has been run. If it hasn't, only the old
// columns are written and the address parts are folded into the one `address` text, so nothing typed is lost.
export function vendorPayloadFromForm(form, detailsReady) {
  const f = (key) => text(form[key]) || null
  const base = {
    name: text(form.name),
    contact_name: f('contact'),
    phone: f('phone'),
    email: f('email'),
    notes: f('notes'),
  }
  if (detailsReady) {
    const payload = { ...base, address: f('address1') }
    for (const [key, column] of Object.entries(DETAIL_COLUMNS)) payload[column] = f(key)
    return payload
  }
  const cityLine = [text(form.city), [text(form.region), text(form.postal)].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const lines = [text(form.address1), text(form.address2), cityLine, text(form.country)].filter(Boolean)
  return { ...base, address: lines.join('\n') || null }
}
