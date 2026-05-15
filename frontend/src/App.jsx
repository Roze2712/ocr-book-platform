import { useState } from 'react'

const apiBase =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8000'

function formatBackendError(detail) {
  if (detail == null) return null
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (typeof e === 'object' && e?.msg ? e.msg : String(e)))
      .join('; ')
  }
  return JSON.stringify(detail)
}

function App() {
  const [file, setFile] = useState(null)
  const [editedText, setEditedText] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const onFileChange = (e) => {
    const picked = e.target.files?.[0] ?? null
    setFile(picked)
    setEditedText('')
    setStatusMessage('')
    setError('')
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Choose an image first.')
      return
    }

    setLoading(true)
    setError('')
    setStatusMessage('')
    setEditedText('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(formatBackendError(data?.detail) ?? `Request failed (${res.status})`)
        return
      }

      const msg = typeof data?.message === 'string' ? data.message : 'OK'
      setStatusMessage(msg)
      const extracted = typeof data?.text === 'string' ? data.text : ''
      setEditedText(extracted)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not reach the backend.',
      )
    } finally {
      setLoading(false)
    }
  }

  const onDownloadPdf = async () => {
    setPdfLoading(true)
    setError('')

    try {
      const res = await fetch(`${apiBase}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editedText }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        setError(formatBackendError(errJson?.detail) ?? `PDF export failed (${res.status})`)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ocr-export.pdf'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not generate the PDF.',
      )
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-5">
        <h1 className="text-xl font-semibold tracking-tight">
          OCR Book Scanner
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Upload an image to OCR the text, edit it below, then download as PDF.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20"
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-300">
            Image
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              disabled={loading}
              className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-600 bg-slate-900 px-4 py-6 text-sm text-slate-400 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:border-slate-500 file:hover:bg-indigo-500 disabled:opacity-50"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading || !file}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {loading ? 'Reading image…' : 'Extract text (OCR)'}
            </button>

            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={pdfLoading}
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pdfLoading ? 'Building PDF…' : 'Download as PDF'}
            </button>
          </div>

          {file && (
            <p className="text-xs text-slate-500">
              Selected: <span className="text-slate-300">{file.name}</span> (
              {(file.size / 1024).toFixed(1)} KB)
            </p>
          )}

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-300">
            Extracted text (editable)
            <textarea
              value={editedText}
              onChange={(event) => setEditedText(event.target.value)}
              rows={14}
              spellCheck
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              placeholder="OCR results will appear here…"
            />
          </label>

          {statusMessage && (
            <p className="rounded-lg border border-emerald-900/80 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
              {statusMessage}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-900/80 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </form>

        <p className="mt-8 text-center text-xs text-slate-500">
          API:{' '}
          <code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">
            {apiBase}
          </code>
          <br />
          Start backend:{' '}
          <code className="mt-1 inline-block rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">
            uvicorn backend.main:app --reload
          </code>
        </p>
      </main>
    </div>
  )
}

export default App
