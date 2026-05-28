// src/app/api/tailor/route.ts
export const runtime     = 'edge'
export const maxDuration = 60

import type { ResumeJSON } from '@/types/resume'
import type { TailorOutput } from '@/lib/tailor-schema'

function extractJSON(raw: string): unknown {
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim()
  const start = stripped.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in response')
  let depth = 0, end = -1
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('Unclosed JSON object in response')
  return JSON.parse(stripped.slice(start, end + 1))
}

function validateEdits(parsed: unknown): TailorOutput {
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not an object')
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.edits)) throw new Error('Missing "edits" array')
  for (const e of obj.edits) {
    const edit = e as Record<string, unknown>
    if (typeof edit.bulletId !== 'string') throw new Error('Edit missing bulletId')
    if (typeof edit.newText  !== 'string') throw new Error('Edit missing newText')
  }
  return obj as unknown as TailorOutput
}

export async function POST(req: Request) {
  try {
    const { resume, jobDescription } = await req.json() as {
      resume:         ResumeJSON
      jobDescription: string
      resumeId:       string
    }

    const allBullets = [
      ...resume.experience.flatMap(e => e.bullets),
      ...(resume.projects   ?? []).flatMap(p => p.bullets),
      ...(resume.activities ?? []).flatMap(a => a.bullets),
    ]

    // Provide skills section as an editable block if present
    if (resume.skills && resume.skills.length > 0) {
      allBullets.push({ id: 'skills-section', text: resume.skills.join(' • ') })
    }

    console.log('[TAILOR API] Total bullets:', allBullets.length)
    if (allBullets.length === 0) {
      return Response.json({ error: 'No bullets found.' }, { status: 400 })
    }

    const bulletsList = allBullets
      .map(b => `{"id":"${b.id}","text":${JSON.stringify(b.text)}}`)
      .join(', ')

    const prompt =
      `You are a professional resume writer who rewrites bullets WITHOUT changing facts.\n` +
      `You NEVER invent new projects, tools, companies or metrics.\n\n` +
      `Return ONLY: {"edits":[{"bulletId":"...","newText":"...","reason":"..."}]}\n\n` +
      `TASK: Lightly rewrite each resume bullet to better match the job description keywords.\n` +
      `STRICT RULES:\n` +
      `1. PRESERVE the original subject — same project, same technology, same achievement\n` +
      `2. NEVER invent projects, tools, or metrics not in the original bullet\n` +
      `3. Only change wording to mirror job description keywords — do not change facts\n` +
      `4. If a bullet already fits well, return it unchanged\n` +
      `5. One edit per bullet — same count in output as input\n` +
      `6. VERY IMPORTANT: Wrap any inserted or modified keywords from the job description in **double asterisks** to make them bold (e.g. **Machine Learning**)\n\n` +
      `JOB DESCRIPTION:\n${jobDescription.slice(0, 1500)}\n\n` +
      `BULLETS:\n[${bulletsList}]`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:      0.2,
            maxOutputTokens:  8192,
            responseMimeType: 'application/json',
          },
        }),
      }
    )
    if (!geminiRes.ok) throw new Error(`Gemini error: ${geminiRes.status}`)
    const geminiData = await geminiRes.json()
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    console.log('[TAILOR API] Raw response preview:', raw.slice(0, 200))

    const parsed  = extractJSON(raw)
    const edits   = validateEdits(parsed)
    console.log('[TAILOR API] ✓ edits:', edits.edits.length)
    return Response.json({ object: edits })

  } catch (error) {
    console.error('[TAILOR API] Fatal:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}