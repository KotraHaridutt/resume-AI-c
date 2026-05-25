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
    const { resume, prompt: userPrompt } = await req.json() as {
      resume: ResumeJSON
      prompt: string
    }

    const allBullets = [
      ...resume.experience.flatMap(e => e.bullets),
      ...(resume.projects   ?? []).flatMap(p => p.bullets),
      ...(resume.activities ?? []).flatMap(a => a.bullets),
    ]

    if (resume.skills && resume.skills.length > 0) {
      allBullets.push({ id: 'skills-section', text: resume.skills.join(' • ') })
    }

    console.log('[CHAT API] Total bullets:', allBullets.length)
    if (allBullets.length === 0) {
      return Response.json({ error: 'No bullets found.' }, { status: 400 })
    }

    const bulletsList = allBullets
      .map(b => `{"id":"${b.id}","text":${JSON.stringify(b.text)}}`)
      .join(', ')

    const prompt =
      `You are a professional resume writer assisting a user via chat.\n` +
      `The user has requested the following edit to their resume bullets:\n` +
      `"${userPrompt}"\n\n` +
      `Return ONLY JSON with this format: {"edits":[{"bulletId":"...","newText":"...","reason":"..."}]}\n\n` +
      `STRICT RULES:\n` +
      `1. Only modify the specific bullets that are relevant to the user's request.\n` +
      `2. For bullets that shouldn't change, DO NOT include them in the edits array.\n` +
      `3. Do not invent new skills or facts that the user didn't provide in the prompt or aren't already there.\n` +
      `4. Just apply the requested formatting, structural, or writing changes.\n\n` +
      `BULLETS:\n[${bulletsList}]`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    console.log('[CHAT API] Raw response preview:', raw.slice(0, 200))

    const parsed  = extractJSON(raw)
    const edits   = validateEdits(parsed)
    console.log('[CHAT API] ✓ edits:', edits.edits.length)
    return Response.json({ object: edits })

  } catch (error) {
    console.error('[CHAT API] Fatal:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}