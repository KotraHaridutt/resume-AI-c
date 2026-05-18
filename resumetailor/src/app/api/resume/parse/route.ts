// src/app/api/resume/parse/route.ts

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse-fork') as (buffer: Buffer) => Promise<{ text: string }>

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey:  process.env.OPENROUTER_API_KEY!,
  headers: {
    'HTTP-Referer': 'https://resumetailor.app',
    'X-Title':      'ResumeTailor',
  },
})

// Zod schema that mirrors your ResumeJSON type exactly
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
  skills: z.array(z.string()),
  education: z.object({
    degree: z.string(),
    school: z.string(),
    year:   z.string(),
  }),
  activities: z.array(z.object({
    id:      z.string(),
    title:   z.string(),
    bullets: z.array(z.object({ id: z.string(), text: z.string() })),
  })).optional(),
})

export async function POST(req: Request) {
  const formData = await req.formData()
  const file     = formData.get('resume') as File | null

  if (!file) {
    return Response.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (!file.name.endsWith('.pdf')) {
    return Response.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: 'File too large — max 5MB' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer      = Buffer.from(arrayBuffer)
  const parsed      = await pdfParse(buffer)
  const rawText     = parsed.text.trim()

  console.log('[PARSE API] Extracted raw text length:', rawText.length)
  console.log('[PARSE API] Raw text (first 500 chars):', rawText.substring(0, 500))

  if (!rawText || rawText.length < 50) {
    return Response.json(
      { error: "Could not extract text from PDF. Make sure it's not a scanned image." },
      { status: 400 }
    )
  }

  const { object } = await generateObject({
    model:  openrouter('nvidia/nemotron-3-nano-30b-a3b:free'),
    schema: resumeSchema,
    prompt: `You are a resume parser. Convert the following resume text into structured JSON.

RULES:
- name: full name only
- contact: combine phone, email, city, LinkedIn, GitHub into one string separated by  •
- objective: extract verbatim if present
- experience: Extract ALL work experience, internships, or job positions. Look for role/position title, company name, and date. Return empty array [] ONLY if absolutely no experience found.
- projects: extract ALL projects with their bullet points EXACTLY as written — do NOT rephrase
- skills: flat array — split "Programming Languages: C, C++" into ["C", "C++"]
- education: most recent degree only
- activities: extra-curricular bullet points each as a separate item in the array
- IDs: experience → "exp-0", "exp-1" | projects → "proj-0", "proj-1" | bullets → "proj-0-b-0", etc.
- CRITICAL: keep ALL text exactly as written — do not rephrase, summarize, or change anything

RESUME TEXT:
${rawText}`,
  })

  console.log('[PARSE API] Parsed result - experience count:', object.experience?.length)
  console.log('[PARSE API] Parsed result - projects count:', object.projects?.length)

  return Response.json({ resume: object })
}