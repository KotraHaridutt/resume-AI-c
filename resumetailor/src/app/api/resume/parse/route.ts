// src/app/api/resume/parse/route.ts
export const runtime     = 'edge'
export const maxDuration = 60

import { z } from 'zod'

const GEMINI_KEY = process.env.GEMINI_API_KEY as string

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes  = new Uint8Array(buffer)
  let binary   = ''
  const chunk  = 8192
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
- contact: NEVER null — combine everything separated by  •  ; use "" if truly nothing found
- experience: ALL jobs/internships — empty array [] if truly none
- projects: title = SHORT name only, date = null if absent
- skills: flat array — split grouped entries ("C, C++, Python" → ["C","C++","Python"])
- education: EVERY degree listed, grade = CGPA/GPA/% or null
- activities: Extra-Curricular/Achievements/Awards/Leadership/Certifications ALL map here
- activities title = 3-4 words max SHORT label, full sentence ONLY in bullets[0].text
- Keep ALL bullet text EXACTLY as written, including "(Project Link)"
- IDs: exp-0,exp-1 / proj-0,proj-1 / edu-0,edu-1 / act-0,act-1
- Bullet IDs: exp-0-b-0, proj-0-b-0, act-0-b-0 etc.`

export async function POST(req: Request) {
  if (!GEMINI_KEY) {
    return Response.json({ error: 'GEMINI_API_KEY not configured on server' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const file     = formData.get('resume') as File | null

    if (!file)                        return Response.json({ error: 'No file uploaded' },             { status: 400 })
    if (!file.name.endsWith('.pdf'))  return Response.json({ error: 'Only PDF files are supported' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: 'File too large — max 5MB' },     { status: 400 })

    const buffer  = await file.arrayBuffer()
    const base64  = arrayBufferToBase64(buffer)

    console.log('[PARSE API] Sending to Gemini, file size:', file.size)

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
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

    console.log('[PARSE API] Gemini status:', geminiRes.status)

    if (geminiRes.status === 429) {
      return Response.json({ error: 'Rate limit — please wait 1 minute and try again' }, { status: 429 })
    }
    if (geminiRes.status === 503) {
      return Response.json({ error: 'Gemini is busy — please try again in 30 seconds' }, { status: 503 })
    }
    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('[PARSE API] Gemini error:', errText.slice(0, 300))
      return Response.json({ error: `Gemini error: ${geminiRes.status}` }, { status: 500 })
    }

    const data    = await geminiRes.json()
    const raw     = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!raw) {
      console.error('[PARSE API] Empty Gemini response:', JSON.stringify(data).slice(0, 300))
      return Response.json({ error: 'Empty response from Gemini' }, { status: 500 })
    }

    console.log('[PARSE API] Raw preview:', raw.slice(0, 200))
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let resume: any
    try {
      const obj    = JSON.parse(cleaned)
      const parsed = resumeSchema.parse(obj)
      const edu    = parsed.education

      resume = {
        ...parsed,
        education: {
          degree: edu[0]?.degree ?? '',
          school: edu[0]?.school ?? '',
          year:   edu[0]?.year   ?? '',
          grade:  edu[0]?.grade,
        },
        allEducation: edu,
      }
    } catch (err) {
      console.error('[PARSE API] Schema error:', err)
      console.error('[PARSE API] Cleaned JSON:', cleaned.slice(0, 800))
      return Response.json({
        error:  'Failed to parse resume structure.',
        detail: err instanceof Error ? err.message : String(err),
      }, { status: 500 })
    }

    console.log('[PARSE API] ✓ projects:', resume.projects?.length, 'activities:', resume.activities?.length)
    return Response.json({ resume })

  } catch (error) {
    console.error('[PARSE API] Fatal:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}