// Shown only when VITE_SANDBOX=true (the sandbox deployment, which uses a copy of the database).
// Sits in main.jsx so it also covers the sign-in screen.
export const IS_SANDBOX = String(import.meta.env.VITE_SANDBOX || '').toLowerCase() === 'true'

if (IS_SANDBOX && typeof document !== 'undefined') document.title = 'SANDBOX - ' + document.title

export default function SandboxBanner() {
  if (!IS_SANDBOX) return null
  return (
    <div className="sandbox-banner" role="status">
      SANDBOX &mdash; a practice copy of the system. Nothing here changes the live system. Don&rsquo;t enter real work.
    </div>
  )
}
