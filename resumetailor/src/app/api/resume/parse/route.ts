// src/app/api/resume/parse/route.ts

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { PDFParse } from 'pdf-parse'

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
  name:    z.string(),
  contact: z.string(),
  experience: z.array(z.object({
    id:      z.string(),
    role:    z.string(),
    company: z.string(),
    date:    z.string(),
    bullets: z.array(z.object({
      id:   z.string(),
      text: z.string(),
    })),
  })),
  skills: z.array(z.string()),
  education: z.object({
    degree: z.string(),
    school: z.string(),
    year:   z.string(),
  }),
})

export async function POST(req: Request) {
  // TODO: Re-enable auth after testing
  // const { userId } = await auth()
  // if (!userId) {
  //   return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // }

  // Read the uploaded PDF as FormData
  const formData  = await req.formData()
  const file      = formData.get('resume') as File | null

  if (!file) {
    return Response.json({ error: 'No file uploaded' }, { status: 400 })
  }

  if (!file.name.endsWith('.pdf')) {
    return Response.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return Response.json({ error: 'File too large — max 5MB' }, { status: 400 })
  }

  // Convert File → Buffer → extract text with pdf-parse
  const arrayBuffer = await file.arrayBuffer()
  const buffer      = Buffer.from(arrayBuffer)
  const parser = new PDFParse({ data: buffer })
  const parsed = await parser.getText()
  // free resources used by pdfjs
  await parser.destroy()
  const rawText     = parsed.text.trim()

  if (!rawText || rawText.length < 50) {
    return Response.json(
      { error: 'Could not extract text from PDF. Make sure it\'s not a scanned image.' },
      { status: 400 }
    )
  }

  // Use AI to convert raw text → structured ResumeJSON
  // generateObject (not streamObject) — we want the full result before responding
  const { object } = await generateObject({
    model:  openrouter('nvidia/nemotron-3-nano-30b-a3b:free'),
    schema: resumeSchema,
    prompt: `You are a resume parser. Convert the following resume text into structured JSON.

RULES:
- Generate unique IDs for experience entries: "exp-0", "exp-1", etc.
- Generate unique IDs for bullets: "exp-0-b-0", "exp-0-b-1", "exp-1-b-0", etc.
- contact field: combine email, phone, location, LinkedIn into one string separated by  •
- Keep bullet text exactly as written — do NOT rephrase anything
- skills: extract as a flat array of individual skill strings
- education: take the most recent/highest degree only
- If a field is missing, use an empty string — never null

RESUME TEXT:
${rawText}`,
  })

  return Response.json({ resume: object })
}