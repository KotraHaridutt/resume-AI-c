// src/app/api/resume/parse/route.ts
export const maxDuration = 30

import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse-fork') as (buffer: Buffer) => Promise<{ text: string }>

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const resumeSchema = z.object({
  name:      z.string(),
  contact:   z.string(),
  objective: z.string().optional(),
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
    subtitle: z.string().optional(),
    date:     z.string().optional(),
    bullets:  z.array(z.object({ id: z.string(), text: z.string() })),
  })),
  skills:    z.array(z.string()),
  education: z.array(z.object({        // ← array now, not single object
    id:     z.string(),
    degree: z.string(),
    school: z.string(),
    year:   z.string(),
    grade:  z.string().optional(),     // CGPA, GPA, percentage etc.
  })),
  activities: z.array(z.object({
    id:      z.string(),
    title:   z.string(),
    bullets: z.array(z.object({ id: z.string(), text: z.string() })),
  })).optional(),
})

// Keep old education shape for PDF rendering compatibility
const resumeSchemaCompat = resumeSchema.transform(data => ({
  ...data,
  // PDF renderer expects education as single object — use first/most recent
  education: {
    degree: data.education[0]?.degree ?? '',
    school: data.education[0]?.school ?? '',
    year:   data.education[0]?.year   ?? '',
    grade:  data.education[0]?.grade,
  },
  // Keep full list for future use
  allEducation: data.education,
}))

type ResumeSchema = z.infer<typeof resumeSchemaCompat>

export async function POST(req: Request) {
  const formData = await req.formData()
  const file     = formData.get('resume') as File | null

  if (!file)                        return Response.json({ error: 'No file uploaded' },             { status: 400 })
  if (!file.name.endsWith('.pdf'))  return Response.json({ error: 'Only PDF files are supported' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: 'File too large — max 5MB' },     { status: 400 })

  const buffer  = Buffer.from(await file.arrayBuffer())
  const parsed  = await pdfParse(buffer)
  const rawText = parsed.text.trim()

  console.log('[PARSE API] Text length:', rawText.length)
  if (!rawText || rawText.length < 50) {
    return Response.json(
      { error: "Could not extract text. Make sure it's not a scanned image." },
      { status: 400 }
    )
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature:      0,
      maxOutputTokens:  6000,
      responseMimeType: 'application/json',
    },
  })

  const prompt = `You are a resume parser. Extract ALL content from the resume faithfully.
Output ONLY valid JSON matching the schema below — no prose, no markdown.

SCHEMA:
{
  "name": "full name",
  "contact": "combine ALL contact info separated by  •  (phone, email, city, linkedin, github, website etc.)",
  "objective": "full objective/summary text verbatim — include if present, omit field if not",
  "experience": [
    {
      "id": "exp-0",
      "role": "job title",
      "company": "company name",
      "date": "date range",
      "bullets": [{ "id": "exp-0-b-0", "text": "bullet text verbatim" }]
    }
  ],
  "projects": [
    {
      "id": "proj-0",
      "title": "project name only — no description",
      "date": "date if present",
      "bullets": [{ "id": "proj-0-b-0", "text": "bullet text verbatim including any (Project Link) references" }]
    }
  ],
  "skills": ["every individual skill as separate string — split grouped skills e.g. 'C, C++, Python' → ['C','C++','Python']"],
  "education": [
    {
      "id": "edu-0",
      "degree": "degree name and field",
      "school": "institution name and location",
      "year": "year or date range",
      "grade": "CGPA/GPA/percentage if present"
    }
  ],
  "activities": [
    {
      "id": "act-0",
      "title": "3-4 word label only e.g. 'NTPC Quiz', 'IEEE Club', 'AI Summit'",
      "bullets": [{ "id": "act-0-b-0", "text": "full sentence verbatim" }]
    }
  ]
}

CRITICAL RULES — read carefully:
1. PRESERVE every word verbatim — do NOT rephrase, summarize or improve any text
2. experience: capture ALL jobs, internships, roles — use empty array [] only if truly none exist
3. projects: title = short name only (e.g. "CardioRisk AI") — full text goes in bullets
4. skills: flat array of individual skills — split ALL grouped entries
5. education: capture EVERY degree/qualification listed (undergraduate, intermediate, high school etc.)
6. activities: sections named "Extra-Curricular", "Achievements", "Awards", "Volunteer", "Leadership", "Certifications" ALL map here — use short title label, full text in bullets[0].text
7. activities title must be SHORT (3-4 words max) — NEVER put the full sentence in title
8. Keep "(Project Link)", "(GitHub)", or any link references inside the bullet text
9. IDs must be sequential: exp-0, exp-1 / proj-0, proj-1 / edu-0, edu-1 / act-0, act-1
   Bullet IDs: exp-0-b-0, exp-0-b-1 / proj-0-b-0 etc.

RESUME TEXT:
${rawText}`

  const result = await model.generateContent(prompt)
  const raw    = result.response.text()
  console.log('[PARSE API] Raw response preview:', raw.slice(0, 400))

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let resume: ResumeSchema
  try {
    const obj = JSON.parse(cleaned)
    resume = resumeSchemaCompat.parse(obj)
  } catch (err) {
    console.error('[PARSE API] Schema validation failed:', err)
    return Response.json({ error: 'Failed to parse resume structure.' }, { status: 500 })
  }

  console.log('[PARSE API] education entries:', (resume as any).allEducation?.length)
  console.log('[PARSE API] experience:', resume.experience?.length)
  console.log('[PARSE API] projects:', resume.projects?.length)
  console.log('[PARSE API] activities:', resume.activities?.length)

  return Response.json({ resume })
}