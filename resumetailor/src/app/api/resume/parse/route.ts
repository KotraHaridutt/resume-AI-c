// src/app/api/resume/parse/route.ts
export const runtime     = 'edge'
export const maxDuration = 60

import { z } from 'zod'

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY as string)

const resumeSchema = z.object({
  name:      z.string(),
  contact:   z.string(),
  objective: z.string().nullable().optional(),
  experience: z.array(z.object({
    id:      z.string(),
    role:    z.string(),
    company: z.string(),
    date:    z.string(),
    bullets: z.array(z.object({ id: z.string(), text: z.string() })),
  })),
  projects: z.array(z.object({
    id:       z.string(),
    title:    z.string(),
    subtitle: z.string().nullable().optional(),
    date:     z.string().nullable().optional(),
    bullets:  z.array(z.object({ id: z.string(), text: z.string() })),
  })),
  skills: z.array(z.string()),
  education: z.array(z.object({
    id:     z.string(),
    degree: z.string(),
    school: z.string(),
    year:   z.string(),
    grade:  z.string().nullable().optional(),
  })),
  activities: z.array(z.object({
    id:      z.string(),
    title:   z.string(),
    bullets: z.array(z.object({ id: z.string(), text: z.string() })),
  })).optional(),
})

const resumeSchemaCompat = resumeSchema.transform(data => ({
  ...data,
  objective: data.objective ?? undefined,
  projects: data.projects.map(p => ({
    ...p,
    date:     p.date     ?? undefined,
    subtitle: p.subtitle ?? undefined,
  })),
  education: {
    degree: data.education[0]?.degree ?? '',
    school: data.education[0]?.school ?? '',
    year:   data.education[0]?.year   ?? '',
    grade:  data.education[0]?.grade  ?? undefined,
  },
  allEducation: data.education,
}))

type ResumeSchema = z.infer<typeof resumeSchemaCompat>

// Convert ArrayBuffer → base64 string (Edge-compatible, no Buffer)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes  = new Uint8Array(buffer)
  let binary   = ''
  const chunk  = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file     = formData.get('resume') as File | null

    if (!file)                        return Response.json({ error: 'No file uploaded' },             { status: 400 })
    if (!file.name.endsWith('.pdf'))  return Response.json({ error: 'Only PDF files are supported' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: 'File too large — max 5MB' },     { status: 400 })

    if (!GEMINI_API_KEY) {
      return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64Data  = arrayBufferToBase64(arrayBuffer)

    console.log('[PARSE API] File size:', file.size, 'bytes, base64 length:', base64Data.length)

    // Single Gemini call — send PDF inline as base64, get structured JSON back
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data:      base64Data,
                },
              },
              {
                text: `You are a resume parser. Output ONLY valid JSON — no prose, no markdown fences.

Parse this resume PDF into JSON with this exact shape:
{
  "name": "string",
  "contact": "phone • email • city • linkedin • github",
  "objective": "full text verbatim, or null if not present",
  "experience": [{ "id":"exp-0", "role":"", "company":"", "date":"", "bullets":[{"id":"exp-0-b-0","text":""}] }],
  "projects": [{ "id":"proj-0", "title":"SHORT name only", "date": null, "bullets":[{"id":"proj-0-b-0","text":""}] }],
  "skills": ["skill1","skill2"],
  "education": [{ "id":"edu-0", "degree":"", "school":"", "year":"", "grade":"CGPA or null" }],
  "activities": [{ "id":"act-0", "title":"3-4 word label", "bullets":[{"id":"act-0-b-0","text":"full sentence verbatim"}] }]
}

RULES:
- experience: ALL jobs/internships — empty array [] if truly none
- projects: title = SHORT name only (e.g. "CardioRisk AI"), date = null if not present
- skills: flat array — split ALL grouped entries (e.g. "C, C++, Python" → ["C","C++","Python"])
- education: EVERY degree listed, grade = CGPA/GPA/percentage or null
- activities: Extra-Curricular/Achievements/Awards/Leadership/Certifications ALL map here
- activities title = 3-4 words max SHORT label, full sentence ONLY in bullets[0].text
- Keep ALL bullet text EXACTLY as written — do not rephrase
- Keep "(Project Link)" or any link references inside bullet text
- IDs sequential: exp-0,exp-1 / proj-0,proj-1 / edu-0,edu-1 / act-0,act-1
- Bullet IDs: exp-0-b-0, proj-0-b-0, act-0-b-0 etc.`,
              },
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

    console.log('[PARSE API] Gemini status:', res.status)

    if (!res.ok) {
      const errText = await res.text()
      console.error('[PARSE API] Gemini error:', errText.slice(0, 500))
      return Response.json(
        { error: `Gemini API error: ${res.status}`, detail: errText.slice(0, 200) },
        { status: 500 }
      )
    }

    const geminiData = await res.json()
    const raw        = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    console.log('[PARSE API] Raw JSON preview:', raw.slice(0, 300))

    if (!raw) {
      console.error('[PARSE API] Empty response from Gemini. Full response:', JSON.stringify(geminiData).slice(0, 500))
      return Response.json({ error: 'Gemini returned empty response' }, { status: 500 })
    }

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let resume: ResumeSchema
    try {
      const obj = JSON.parse(cleaned)
      resume    = resumeSchemaCompat.parse(obj)
    } catch (err) {
      console.error('[PARSE API] Parse failed:', err)
      console.error('[PARSE API] Raw JSON that failed:', cleaned.slice(0, 1000))
      return Response.json({
        error:  'Failed to parse resume structure.',
        detail: err instanceof Error ? err.message : String(err),
      }, { status: 500 })
    }

    console.log('[PARSE API] ✓ education:', (resume as any).allEducation?.length,
      'projects:', resume.projects?.length,
      'activities:', resume.activities?.length)

    return Response.json({ resume })

  } catch (error) {
    console.error('[PARSE API] Fatal:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}