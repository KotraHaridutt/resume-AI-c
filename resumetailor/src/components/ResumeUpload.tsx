// src/components/ResumeUpload.tsx
'use client'
import { useState, useCallback } from 'react'
import { z } from 'zod'
import type { ResumeJSON } from '@/types/resume'

const resumeSchema = z.object({
  name:      z.string(),
  contact:   z.string().nullable().optional().transform(v => v ?? ''),
  objective: z.string().nullable().optional().transform(v => v ?? undefined),
  experience: z.array(z.object({
    id:      z.string(),
    role:    z.string(),
    company: z.string(),
    date:    z.string(),
    bullets: z.array(z.object({ id: z.string(), text: z.string() })),
  })).default([]),
  projects: z.array(z.object({
    id:       z.string(),
    title:    z.string(),
    subtitle: z.string().nullable().optional().transform(v => v ?? undefined),
    date:     z.string().nullable().optional().transform(v => v ?? undefined),
    bullets:  z.array(z.object({ id: z.string(), text: z.string() })),
  })).default([]),
  skills: z.array(z.string()).default([]),
  education: z.array(z.object({
    id:     z.string(),
    degree: z.string(),
    school: z.string(),
    year:   z.string(),
    grade:  z.string().nullable().optional().transform(v => v ?? undefined),
  })).default([]),
  activities: z.array(z.object({
    id:      z.string(),
    title:   z.string(),
    bullets: z.array(z.object({ id: z.string(), text: z.string() })),
  })).default([]),
})

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary  = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const PROMPT = `You are a resume parser. Output ONLY valid JSON — no prose, no markdown fences.

Parse this resume PDF into JSON with this exact shape:
{
  "name": "string",
  "contact": "combine ALL: phone • email • city • linkedin • github — NEVER null, use empty string if missing",
  "objective": "full text verbatim, or null if not present",
  "experience": [{ "id":"exp-0", "role":"", "company":"", "date":"", "bullets":[{"id":"exp-0-b-0","text":""}] }],
  "projects": [{ "id":"proj-0", "title":"SHORT name only", "date": null, "bullets":[{"id":"proj-0-b-0","text":""}] }],
  "skills": ["skill1","skill2"],
  "education": [{ "id":"edu-0", "degree":"", "school":"", "year":"", "grade":"CGPA or null" }],
  "activities": [{ "id":"act-0", "title":"3-4 word label", "bullets":[{"id":"act-0-b-0","text":"full sentence verbatim"}] }]
}
RULES:
- contact: NEVER null — use "" if nothing found
- experience: ALL jobs/internships — [] if truly none
- projects: title = SHORT name only, date = null if absent
- skills: flat array — split grouped entries
- education: EVERY degree, grade = CGPA/GPA/% or null
- activities: Extra-Curricular/Achievements/Awards/Leadership ALL map here, title = 3-4 words max
- Keep ALL bullet text EXACTLY as written including "(Project Link)"
- IDs: exp-0,exp-1 / proj-0,proj-1 / edu-0,edu-1 / act-0,act-1 — bullets: exp-0-b-0 etc.`

interface Props { onParsed: (resume: ResumeJSON) => void }

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
      // ── Call Gemini directly from browser — no server timeout risk ──
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
      if (!apiKey) throw new Error('Gemini API key not configured')

      const base64 = toBase64(await file.arrayBuffer())

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'application/pdf', data: base64 } },
                { text: PROMPT },
              ],
            }],
            generationConfig: {
              temperature:      0,
              maxOutputTokens:  8192,
              responseMimeType: 'application/json',
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

      const data    = await res.json()
      const raw     = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      if (!raw) throw new Error('Empty response from Gemini')

      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const obj     = JSON.parse(cleaned)
      const parsed  = resumeSchema.parse(obj)
      const edu     = parsed.education

      const resume = {
        ...parsed,
        education: {
          degree: edu[0]?.degree ?? '',
          school: edu[0]?.school ?? '',
          year:   edu[0]?.year   ?? '',
          grade:  edu[0]?.grade,
        },
        allEducation: edu,
      } as unknown as ResumeJSON

      onParsed(resume)
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
          <p>• Single-column layouts parse most accurately</p>
          <p>• Your data never leaves the session — nothing is stored without your action</p>
        </div>
      </div>
    </div>
  )
}