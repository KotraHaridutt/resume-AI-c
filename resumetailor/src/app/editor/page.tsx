// src/app/editor/page.tsx  (HTML approach — complete rewrite)
'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { ResumeUpload } from '@/components/v2/ResumeUpload'
import { JDInput }       from '@/components/JDInput'
import type { HtmlResume, BulletStateMap, BulletStatus } from '@/types/html-resume'

// ── Inject current bullet states into HTML ───────────────────────
function applyEditsToHtml(html: string, states: BulletStateMap): string {
  const parseHtmlBold = (t: string) => t.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: bold;">$1</strong>');
  return html.replace(
    /(<span\s+data-bullet-id="([^"]+)"[^>]*>)[^<]+(<\/span>)/g,
    (_, open, id, close) => {
      const state = states[id]
      if (!state || state.status === 'original') {
        // Also parse bold on original text if it accidentally contains **
        if (_ && _.includes('**')) {
          return _.replace(/>([^<]+)</, (match, inner) => `>${parseHtmlBold(inner)}<`);
        }
        return _;
      }
      // Highlight accepted = green, pending = yellow
      const bg = state.status === 'accepted'
        ? 'background:#dcfce7;border-radius:2px;'
        : 'background:#fef9c3;border-radius:2px;'
      const currentHtml = parseHtmlBold(state.current);
      return `${open.replace('>', ` style="${bg}">`)}${currentHtml}${close}`
    }
  )
}

// ── Download as PDF via print dialog ────────────────────────────
function printHtml(html: string) {
  // Strip ALL highlight background styles before printing
  const cleanHtml = html.replace(/style="background:#[^"]*;border-radius:[^"]*"/g, '')

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <html><head>
      <style>
        @media print {
          @page { size: A4; margin: 0; }
          body  { margin: 0; }
        }
        /* Remove any leftover highlight backgrounds */
        [data-bullet-id] { background: none !important; }
      </style>
    </head><body>${cleanHtml}</body></html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}

const renderBoldText = (text: string) => {
  if (!text) return null;
  return text.split('**').map((part, i) => {
    if (!part) return null;
    if (i % 2 === 1) return <strong key={i} style={{ fontWeight: 'bold' }}>{part}</strong>
    return <span key={i}>{part}</span>
  })
}

// ── Bullet review panel ──────────────────────────────────────────
function BulletReviewPanel({
  bullets, states, onAccept, onReject, onAcceptAll,
}: {
  bullets:     HtmlResume['bullets']
  states:      BulletStateMap
  onAccept:    (id: string) => void
  onReject:    (id: string) => void
  onAcceptAll: () => void
}) {
  const changed  = bullets.filter(b => states[b.id]?.status === 'changed')
  const accepted = bullets.filter(b => states[b.id]?.status === 'accepted')

  if (changed.length === 0 && accepted.length === 0) return null

  return (
    <div className="w-80 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {changed.length > 0
            ? `${changed.length} change${changed.length !== 1 ? 's' : ''} to review`
            : `${accepted.length} accepted`}
        </span>
        {changed.length > 0 && (
          <button
            onClick={onAcceptAll}
            className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
          >
            ✓ Accept All
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {bullets
          .filter(b => states[b.id]?.status !== 'original')
          .map(b => {
            const state = states[b.id]
            return (
              <div
                key={b.id}
                className={`p-3 rounded-lg border text-xs ${
                  state?.status === 'accepted'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <div className="text-gray-400 line-through mb-1 leading-relaxed">{renderBoldText(b.text)}</div>
                <div className="text-gray-800 leading-relaxed">{renderBoldText(state?.current || '')}</div>
                {state?.status === 'changed' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => onAccept(b.id)}
                      className="flex-1 py-1 bg-green-600 text-white rounded text-[10px] hover:bg-green-700"
                    >
                      ✓ Accept
                    </button>
                    <button
                      onClick={() => onReject(b.id)}
                      className="flex-1 py-1 bg-white text-gray-600 border border-gray-300 rounded text-[10px] hover:bg-gray-50"
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
                {state?.status === 'accepted' && (
                  <div className="mt-1 text-[10px] text-green-600">✓ accepted</div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

// ── Main editor page ─────────────────────────────────────────────
export default function EditorPage() {
  const [resume,    setResume]    = useState<HtmlResume | null>(null)
  const [states,    setStates]    = useState<BulletStateMap>({})
  const [jd,        setJd]        = useState('')
  const [jdOpen,    setJdOpen]    = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const iframeRef                 = useRef<HTMLIFrameElement>(null)

  // When resume loads, init all bullet states as 'original'
  const handleParsed = useCallback((r: HtmlResume) => {
    setResume(r)
    const init: BulletStateMap = {}
    r.bullets.forEach(b => { init[b.id] = { status: 'original', current: b.text } })
    setStates(init)
  }, [])

  // Update iframe whenever HTML or states change
  useEffect(() => {
    if (!resume || !iframeRef.current) return
    const html = applyEditsToHtml(resume.html, states)
    const doc  = iframeRef.current.contentDocument
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
  }, [resume, states])

  const tailor = useCallback(async () => {
    if (!resume || !jd.trim()) return
    setIsLoading(true)
    setError(null)

    // Reset non-accepted back to original before new tailor run
    setStates(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status !== 'accepted') {
          const original = resume.bullets.find(b => b.id === id)
          if (original) next[id] = { status: 'original', current: original.text }
        }
      })
      return next
    })

    try {
      const res = await fetch('/api/tailor-v2', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          bullets:        resume.bullets.map(b => ({ id: b.id, text: b.text })),
          jobDescription: jd,
        }),
      })

      if (res.status === 429) throw new Error('Rate limit — wait 1 minute and retry')
      if (res.status === 503) throw new Error('AI busy — try again in 30 seconds')
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? `Error ${res.status}`)
      }

      const { edits } = await res.json() as { edits: { bulletId: string; newText: string }[] }

      setStates(prev => {
        const next = { ...prev }
        edits.forEach(edit => {
          const original = resume.bullets.find(b => b.id === edit.bulletId)
          if (!original) return
          if (edit.newText.trim() !== original.text.trim()) {
            next[edit.bulletId] = { status: 'changed', current: edit.newText }
          }
        })
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [resume, jd])

  const acceptBullet = useCallback((id: string) => {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], status: 'accepted' } }))
  }, [])

  const rejectBullet = useCallback((id: string) => {
    const original = resume?.bullets.find(b => b.id === id)
    if (!original) return
    setStates(prev => ({ ...prev, [id]: { status: 'original', current: original.text } }))
  }, [resume])

  const acceptAll = useCallback(() => {
    setStates(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status === 'changed') next[id] = { ...next[id], status: 'accepted' }
      })
      return next
    })
  }, [])

  const download = useCallback(() => {
    if (!resume) return
    printHtml(applyEditsToHtml(resume.html, states))
  }, [resume, states])

  // ── Upload screen ──
  if (!resume) {
    return (
      <div className="h-screen bg-gray-50">
        <ResumeUpload onParsed={handleParsed} />
      </div>
    )
  }

  const pendingCount  = Object.values(states).filter(s => s.status === 'changed').length
  const acceptedCount = Object.values(states).filter(s => s.status === 'accepted').length

  // ── Editor screen ──
  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-bold text-sm text-blue-600">ResumeTailor</span>
          <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full">
            <span className="text-xs text-gray-600 max-w-[160px] truncate">📄 {resume.name}</span>
            <button
              onClick={() => { setResume(null); setStates({}) }}
              className="text-[10px] text-gray-400 hover:text-red-400 ml-1"
            >✕</button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-center">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              AI is tailoring your resume...
            </div>
          )}
          {!isLoading && pendingCount > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} to review
            </span>
          )}
          {!isLoading && pendingCount === 0 && acceptedCount > 0 && (
            <span className="text-xs text-green-600">✓ {acceptedCount} accepted — ready to download</span>
          )}
          {error && <span className="text-xs text-red-500">⚠ {error}</span>}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => jd.trim() && tailor()}
            disabled={isLoading || !jd.trim()}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Tailoring...' : '✨ Tailor with AI'}
          </button>
          <button
            onClick={download}
            className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700"
          >
            ⬇ Download PDF
          </button>
        </div>
      </div>

      {/* JD Input */}
      <JDInput value={jd} onChange={setJd} open={jdOpen} onToggle={() => setJdOpen(o => !o)} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">

        {/* Resume iframe — scrollable, A4 look */}
        <div className="flex-1 overflow-auto bg-gray-200 p-6 flex justify-center">
          <iframe
            ref={iframeRef}
            title="resume-preview"
            className="bg-white shadow-xl"
            style={{ width: 794, minHeight: 1123, border: 'none', flexShrink: 0 }}
            sandbox="allow-same-origin"
          />
        </div>

        {/* Right panel — bullet review */}
        <BulletReviewPanel
          bullets={resume.bullets}
          states={states}
          onAccept={acceptBullet}
          onReject={rejectBullet}
          onAcceptAll={acceptAll}
        />
      </div>
    </div>
  )
}