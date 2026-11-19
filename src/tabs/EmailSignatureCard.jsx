import { useEffect, useRef, useState } from 'react'
import { MAX_SIGNATURE_CHARS, cleanSignatureHtml, isBlankSignature } from '../emailSignature'

// The logged-in person's rich-text email signature, added to the bottom of the email to a vendor. Outlook's own
// signature can't be read from a web page, so it is copied once from Outlook and pasted into the box here: the
// box keeps the formatting (fonts, colours, links, the logo). `onSave` gets the tidied HTML, or null to remove it.
export default function EmailSignatureCard({ current, onSave, onClose, busy, message }) {
  const editorRef = useRef(null)
  const [note, setNote] = useState(null)

  // Show the signature already on file once, when the card opens (the box then belongs to the person typing).
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = current || ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function save() {
    const { html, droppedImages } = cleanSignatureHtml(editorRef.current.innerHTML)
    if (isBlankSignature(html)) {
      setNote({ error: true, text: 'The box is empty. Paste your signature first, or use Remove to clear the saved one.' })
      return
    }
    if (html.length > MAX_SIGNATURE_CHARS) {
      setNote({ error: true, text: 'That signature is too large (the pictures in it, most likely). Use a smaller logo.' })
      return
    }
    if (droppedImages > 0) {
      setNote({
        error: false,
        text: `${droppedImages} picture${droppedImages === 1 ? '' : 's'} couldn't be kept (Outlook pastes a logo as a file on your own computer). Use Add picture to add it, then Save again. Nothing was saved yet.`,
      })
      editorRef.current.innerHTML = html
      return
    }
    setNote(null)
    onSave(html)
  }

  // Add a picture (a logo) from a file, shrunk so the signature stays small.
  function addPicture(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 400 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/png')
      // Stored at up to 400px wide so it stays sharp, shown at half that (email programs follow the width
      // attribute).
      const shownWidth = Math.max(1, Math.round(canvas.width / 2))
      const shownHeight = Math.max(1, Math.round(canvas.height / 2))
      const tag = `<img src="${dataUrl}" width="${shownWidth}" height="${shownHeight}" alt="">`
      editorRef.current.focus()
      if (!document.execCommand('insertHTML', false, tag)) editorRef.current.insertAdjacentHTML('beforeend', tag)
      setNote(null)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setNote({ error: true, text: "That file couldn't be read as a picture. Use a PNG, JPG or GIF." })
    }
    img.src = url
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>My Email Signature</h2>
        <p className="sub" style={{ margin: 0 }}>
          Added to the bottom of the email when you press Email Vendor. In Outlook open your signature (File &gt; Options &gt; Mail
          &gt; Signatures), select all of it (Ctrl+A), copy (Ctrl+C), click in the box below and paste (Ctrl+V). Fonts, colours,
          links and your logo come across. If the logo doesn't, use Add picture.
        </p>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        aria-label="Email signature"
        style={{
          minHeight: 140,
          maxWidth: 640,
          padding: '12px 14px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: '#fff',
          color: '#000',
          overflowWrap: 'anywhere',
        }}
      />

      {(note || message) && (
        <p className={'status ' + (note?.error || (!note && message) ? 'err' : 'ok')} style={{ marginTop: 10 }}>
          {note?.text || message}
        </p>
      )}

      <div className="form-actions">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save Signature'}
        </button>
        <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          Add picture
          <input type="file" accept="image/png,image/jpeg,image/gif" onChange={addPicture} style={{ display: 'none' }} />
        </label>
        {current && (
          <button
            className="btn-secondary"
            onClick={() => {
              if (window.confirm('Remove your saved email signature?')) onSave(null)
            }}
            disabled={busy}
          >
            Remove
          </button>
        )}
        <button className="btn-secondary" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </div>
  )
}
