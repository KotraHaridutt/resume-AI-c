// src/app/api/tailor/route.ts — temporarily no auth for testing
import { streamObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { tailorSchema } from '@/lib/tailor-schema'
import type { ResumeJSON } from '@/types/resume'

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey:  process.env.OPENROUTER_API_KEY!,
  headers: {
    'HTTP-Referer': 'https://resumetailor.app',
    'X-Title':      'ResumeTailor',
  },
})

export async function POST(req: Request) {
  // Auth temporarily removed for debugging — add back after route works
  
  const { resume, jobDescription } = await req.json() as {
    resume:         ResumeJSON
    jobDescription: string
    resumeId:       string
  }

  const bulletsList = resume.experience
    .flatMap(exp => exp.bullets)
    .map(b => `- id: "${b.id}" | text: "${b.text}"`)
    .join('\n')

  const totalBullets = resume.experience.flatMap(e => e.bullets).length

  const result = await streamObject({
    model:  openrouter('nvidia/nemotron-3-nano-30b-a3b:free'),
    schema: tailorSchema,
    prompt: `You are an expert resume writer helping a job seeker tailor their resume.

JOB DESCRIPTION:
${jobDescription}

RESUME BULLETS TO REWRITE:
${bulletsList}

INSTRUCTIONS:
- Rewrite each bullet to match keywords and requirements in the job description  
- Keep the same core achievement — do NOT invent metrics or skills that don't exist
- Use strong action verbs and quantify where possible
- You MUST return exactly ${totalBullets} edits — one for each bullet ID listed above
- reason should be 1 short sentence explaining the key change made

Return ALL ${totalBullets} bullets.`,
  })

  return result.toTextStreamResponse()
}