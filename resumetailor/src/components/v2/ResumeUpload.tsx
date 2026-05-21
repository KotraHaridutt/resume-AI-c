// src/components/ResumeUpload.tsx 
'use client'
import { useState, useCallback } from 'react'
import type { HtmlResume } from '@/types/html-resume'

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary  = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Extracts all bullet spans from HTML and returns bullet array
function extractBullets(html: string): HtmlResume['bullets'] {
  const bullets: HtmlResume['bullets'] = []
  // Match spans with data-bullet-id — handles multiline text and nested whitespace
  const regex = /data-bullet-id="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g
  let match
  while ((match = regex.exec(html)) !== null) {
    const id        = match[1]
    // Strip any inner HTML tags and normalize whitespace
    const text      = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!text) continue  // skip empty spans
    const sectionId = id.split('-b-')[0] ?? 'unknown'
    bullets.push({ id, text, sectionId })
  }
  console.log('[extractBullets] Found:', bullets.length, 'bullets')
  return bullets
}

const PARSE_PROMPT = `You are a resume-to-HTML converter. Your ONLY job is to reproduce the resume as pixel-faithful HTML. Do NOT improve, rewrite, or change any text.

OUTPUT: Raw HTML only. Start with <!DOCTYPE html>. No markdown, no code fences, no explanation.

LAYOUT RULES:
- Page: max-width 794px, margin 0 auto, padding 48px 54px, box-sizing border-box
- Font: font-family Georgia, 'Times New Roman', serif; font-size 11pt; line-height 1.5; color #111
- Name: font-size 20pt, font-weight bold, text-align center, margin-bottom 4px
- Contact line: font-size 9pt, text-align center, color #444, margin-bottom 12px — use plain text separators like  •  between items, NO emoji icons
- Section headings: font-size 9pt, font-weight bold, text-transform uppercase, letter-spacing 1.5px, border-bottom 1.5px solid #333, padding-bottom 2px, margin-top 16px, margin-bottom 6px
- Job/project title rows: display flex, justify-content space-between for title and date
- Bullet points: use actual <ul> with list-style-type disc, padding-left 18px, margin 2px 0 per <li>
- NO tables, NO floats — use flex only for title+date rows

CONTENT RULES — CRITICAL:
1. Copy every word VERBATIM — do not rephrase, improve, summarize, or add any text
2. If original has "Shipped the classifier" — HTML must say "Shipped the classifier" — NOT "Deployed the classifier"
3. Preserve ALL sections: Experience, Skills, Education, Projects, Publications, Achievements, Awards, Activities, Objective — whatever exists
4. Preserve bullet structure — if original has • bullets, use <li> elements
5. Preserve sub-labels like "Scam Moderation:", "Auto-Retraining:" exactly as written
6. Contact info: strip emoji/icon characters (ï § # ☎ ✉), keep only the actual text/numbers

DATA ATTRIBUTES — wrap every bullet <li> content in a span:
<li><span data-bullet-id="SECTIONID-b-N">exact bullet text here</span></li>
- exp-0-b-0, exp-0-b-1 = first job bullets
- exp-1-b-0 = second job bullets  
- proj-0-b-0 = first project bullets
- pub-0-b-0 = publications bullets
- ach-b-0, ach-b-1 = achievements (standalone sentences)
- act-b-0 = activities
Do NOT wrap: name, contact, section headings, job titles, dates, skill lines, institution names

SELF-CONTAINED: inline CSS only, no external fonts or stylesheets, renders in iframe with no network requests.`

interface Props {
  onParsed: (resume: HtmlResume) => void
}

export function ResumeUpload({ onParsed }: Props) {
  const [status,   setStatus]   = useState<'idle' | 'parsing' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)

  const parseResume = useCallback(async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      setErrorMsg('Only PDF files are supported'); setStatus('error'); return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('File too large — max 5MB'); setStatus('error'); return
    }

    setStatus('parsing')
    setErrorMsg('')

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
      if (!apiKey) throw new Error('Gemini API key not configured')

      const base64 = toBase64(await file.arrayBuffer())

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'application/pdf', data: base64 } },
                { text: PARSE_PROMPT },
              ],
            }],
            generationConfig: {
              temperature:     0,
              maxOutputTokens: 8192,
            },
          }),
        }
      )

      if (res.status === 429) throw new Error('Rate limit — please wait 1 minute and try again')
      if (res.status === 503) throw new Error('Gemini is busy — please try again in 30 seconds')
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error?.message ?? `Gemini error: ${res.status}`)
      }

      const data = await res.json()
      let html   = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      if (!html) throw new Error('Empty response from Gemini')

      // Strip markdown fences if Gemini wraps in ```html
      html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '').trim()

      const bullets = extractBullets(html)
      console.log('[ResumeUpload] Extracted bullets:', bullets.length)

      // Extract candidate name from HTML title or first h1
      const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ??
                        html.match(/<title>([^<]+)<\/title>/i)
      const name = nameMatch?.[1]?.trim() ?? file.name.replace('.pdf', '')

      onParsed({ html, bullets, name })
    } catch (err) {
      console.error('[ResumeUpload] Error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse resume')
      setStatus('error')
    }
  }, [onParsed])

  const handleFile = useCallback((f: File | null | undefined) => {
    if (f) parseResume(f)
  }, [parseResume])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">ResumeTailor</h1>
        <p className="text-center text-gray-500 text-sm mb-8">
          Upload your resume, paste a job description, and let AI tailor it live
        </p>
        <div
          onDragOver={e  => { e.preventDefault(); setDragging(true)  }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('resume-file-input')?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 bg-white'
          }`}
        >
          <input id="resume-file-input" type="file" accept=".pdf" className="hidden"
            onChange={e => handleFile(e.target.files?.[0])} />
          {status === 'parsing' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-blue-600 font-medium">Parsing your resume...</p>
              <p className="text-xs text-gray-400">This takes 5–15 seconds</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-gray-700 font-medium">Drop your resume here</p>
              <p className="text-sm text-gray-400">or click to browse — PDF only, max 5MB</p>
            </div>
          )}
        </div>
        {status === 'error' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            ⚠ {errorMsg}
          </div>
        )}
        <div className="mt-6 text-xs text-gray-400 space-y-1">
          <p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">Tips for best results</p>
          <p>• Use a text-based PDF, not a scanned image</p>
          <p>• All resume formats and sections are supported</p>
          <p>• Your data never leaves your browser during upload</p>
        </div>
      </div>
    </div>
  )
}