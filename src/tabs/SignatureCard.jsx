import { useEffect, useRef, useState } from 'react'

// Signature maker for the logged-in user: draw one with the mouse/finger or
// upload a picture of a real one. Either way it ends up as a small PNG with a
// transparent background (so it sits cleanly on the PO), handed to onSave as a
// data URL.
const WIDTH = 480
const HEIGHT = 160

export default function SignatureCard({ current, onSave, onClose, busy, message }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState(null)

  const context = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    return ctx
  }

  // Show the signature already on file so it's clear what's there now.
  useEffect(() => {
    if (!current) return
    const img = new Image()
    img.onload = () => canvasRef.current?.getContext('2d').drawImage(img, 0, 0, WIDTH, HEIGHT)
    img.src = current
  }, [current])

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT }
  }
  const down = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = point(e)
    const ctx = context()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.01, y + 0.01)
    ctx.stroke()
    setDirty(true)
  }
  const move = (e) => {
    if (!drawing.current) return
    const { x, y } = point(e)
    const ctx = context()
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  const up = () => {
    drawing.current = false
  }

  const clear = () => {
    canvasRef.current.getContext('2d').clearRect(0, 0, WIDTH, HEIGHT)
    setDirty(true)
  }

  // A scanned/photographed signature: scale it to fit and make near-white
  // pixels transparent so a white page background doesn't show as a box.
  const upload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(WIDTH / img.width, HEIGHT / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const ctx = canvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      ctx.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
      const data = ctx.getImageData(0, 0, WIDTH, HEIGHT)
      for (let i = 0; i < data.data.length; i += 4) {
        if (data.data[i] > 235 && data.data[i + 1] > 235 && data.data[i + 2] > 235) data.data[i + 3] = 0
      }
      ctx.putImageData(data, 0, 0)
      URL.revokeObjectURL(url)
      setDirty(true)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setError("That file couldn't be read as an image.")
    }
    img.src = url
  }

  // True when nothing has been drawn (every pixel transparent).
  const isBlank = () => {
    const { data } = canvasRef.current.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT)
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false
    return true
  }

  const save = () => {
    if (isBlank()) {
      setError('Draw or upload your signature first, or use Remove to clear it.')
      return
    }
    onSave(canvasRef.current.toDataURL('image/png'))
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>My Signature</h2>
      </div>
      <p className="sub" style={{ marginTop: 0 }}>
        Printed on the &ldquo;Authorized by&rdquo; line of every purchase order you approve. Draw it below, or upload a picture of your
        signature.
      </p>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          width: '100%',
          maxWidth: WIDTH,
          aspectRatio: `${WIDTH} / ${HEIGHT}`,
          border: '1px solid #bbb',
          borderRadius: 6,
          background: '#fff',
          touchAction: 'none',
          cursor: 'crosshair',
          display: 'block',
        }}
      />
      <div className="form-actions" style={{ marginTop: 10 }}>
        <button className="btn-primary" type="button" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save signature'}
        </button>
        <button className="btn-secondary" type="button" onClick={clear} disabled={busy}>
          Clear
        </button>
        <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          Upload picture
          <input type="file" accept="image/*" onChange={upload} style={{ display: 'none' }} disabled={busy} />
        </label>
        {current && (
          <button className="btn-secondary" type="button" onClick={() => onSave(null)} disabled={busy}>
            Remove saved signature
          </button>
        )}
        <button className="btn-secondary" type="button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      {(error || message) && <div className="status err">{error || message}</div>}
    </div>
  )
}
