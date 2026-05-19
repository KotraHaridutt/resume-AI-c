// src/app/api/resume/parse/route.ts

// Edge runtime — NO timeout limit on Vercel Hobby plan (vs 10s for Node)
export const runtime    = 'edge'
export const maxDuration = 60

import { z } from 'zod'

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

// ── PDF parse via Gemini File API (edge-compatible, no pdf-parse needed) ──────
async function extractTextFromPDF(fileBlob: Blob, fileSize: number): Promise<string> {
  // Upload file to Gemini Files API
  const uploadRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media`,
    {
      method: 'POST',
      headers: {
        'Content-Type':   'application/pdf',
        'X-Goog-Api-Key': process.env.GEMINI_API_KEY!,
        'Content-Length': fileSize.toString(),
      },
      body: fileBlob,
    }
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Gemini file upload failed: ${err.slice(0, 200)}`)
  }

  const uploadData  = await uploadRes.json()
  const fileUri     = uploadData.file?.uri
  if (!fileUri) throw new Error('No file URI returned from Gemini upload')

  console.log('[PARSE API] File uploaded to Gemini:', fileUri)

  // Now parse + structure in one call using the uploaded file
  const parseRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { mime_type: 'application/pdf', file_uri: fileUri } },
            { text: 'Extract all text from this PDF resume exactly as written. Return only the raw text, no formatting, no JSON.' },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      }),
    }
  )

  if (!parseRes.ok) throw new Error(`Gemini text extraction failed: ${parseRes.status}`)
  const parseData = await parseRes.json()
  return parseData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function structureResume(rawText: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `You are a resume parser. Output ONLY valid JSON — no prose, no markdown.

Parse this resume into JSON with this exact shape:
{
  "name": "string",
  "contact": "phone • email • city • linkedin • github",
  "objective": "full text verbatim or null if not present",
  "experience": [{ "id":"exp-0", "role":"", "company":"", "date":"", "bullets":[{"id":"exp-0-b-0","text":""}] }],
  "projects": [{ "id":"proj-0", "title":"SHORT name only", "date": null, "bullets":[{"id":"proj-0-b-0","text":""}] }],
  "skills": ["skill1","skill2"],
  "education": [{ "id":"edu-0", "degree":"", "school":"", "year":"", "grade":"CGPA or null" }],
  "activities": [{ "id":"act-0", "title":"3-4 word label", "bullets":[{"id":"act-0-b-0","text":"full sentence"}] }]
}

RULES:
- experience: ALL jobs/internships — empty array [] if none
- projects: title = SHORT name only, date = null if not present
- skills: flat array, split ALL grouped entries
- education: EVERY degree listed, grade = CGPA/GPA/percentage or null
- activities: sections named Extra-Curricular/Achievements/Awards/Leadership ALL map here
- activities title = SHORT label 3-4 words max, full sentence in bullets[0].text ONLY
- Keep ALL bullet text EXACTLY as written
- IDs sequential: exp-0,exp-1 / proj-0,proj-1 / edu-0,edu-1 / act-0,act-1
- Bullet IDs: exp-0-b-0, proj-0-b-0, act-0-b-0 etc.

RESUME TEXT:
${rawText}` }],
        }],
        generationConfig: {
          temperature:      0,
          maxOutputTokens:  8192,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!res.ok) throw new Error(`Gemini structure call failed: ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file     = formData.get('resume') as File | null

    if (!file)                        return Response.json({ error: 'No file uploaded' },             { status: 400 })
    if (!file.name.endsWith('.pdf'))  return Response.json({ error: 'Only PDF files are supported' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: 'File too large — max 5MB' },     { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const fileBytes   = new Uint8Array(arrayBuffer)   // kept for size check
    const fileBlob    = new Blob([arrayBuffer], { type: 'application/pdf' })

    console.log('[PARSE API] File size:', fileBytes.length, 'bytes')

    // Step 1: Extract raw text via Gemini
    const rawText = await extractTextFromPDF(fileBlob, fileBytes.length)
    console.log('[PARSE API] Extracted text length:', rawText.length)
    console.log('[PARSE API] Text preview:', rawText.slice(0, 200))

    if (!rawText || rawText.length < 50) {
      return Response.json(
        { error: "Could not extract text. Make sure it's not a scanned image." },
        { status: 400 }
      )
    }

    // Step 2: Structure into JSON
    const raw     = await structureResume(rawText)
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    console.log('[PARSE API] Structured JSON preview:', cleaned.slice(0, 300))

    let resume: ResumeSchema
    try {
      const obj = JSON.parse(cleaned)
      resume    = resumeSchemaCompat.parse(obj)
    } catch (err) {
      console.error('[PARSE API] Parse failed:', err)
      console.error('[PARSE API] Raw JSON:', cleaned.slice(0, 1000))
      return Response.json({
        error:  'Failed to parse resume structure.',
        detail: err instanceof Error ? err.message : String(err),
      }, { status: 500 })
    }

    console.log('[PARSE API] ✓ education:', (resume as any).allEducation?.length,
      'projects:', resume.projects?.length, 'activities:', resume.activities?.length)

    return Response.json({ resume })

  } catch (error) {
    console.error('[PARSE API] Fatal:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}