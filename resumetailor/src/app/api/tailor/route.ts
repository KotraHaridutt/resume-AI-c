// src/app/api/tailor/route.ts
export const maxDuration = 120 // seconds — required for slow free models
import type { ResumeJSON } from '@/types/resume'
import type { TailorOutput, TailorEdit } from '@/lib/tailor-schema'

const FREE_MODELS = [
  'openrouter/auto',                         // auto-picks fastest free model
  'nvidia/nemotron-3-super-120b-a12b:free',
  'deepseek/deepseek-v4-flash:free',
  'z-ai/glm-4.5-air:free',
]

// ── Per-request timeout so we never hit Next.js 504 ──────────────
const MODEL_TIMEOUT_MS = 55_000

async function callOpenRouter(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer':  'https://resumetailor.app',
        'X-Title':       'ResumeTailor',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        temperature: 0.2,
        max_tokens:  3000,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${model} HTTP ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    if (!content) throw new Error(`${model} returned empty content`)
    return content
  } finally {
    clearTimeout(timer)
  }
}

// ── Robustly extract the first {...} block from messy model output ─
function extractJSON(raw: string): unknown {
  // 1. Strip ```json ... ``` fences
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim()

  // 2. Find the outermost { ... } 
  const start = stripped.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in response')

  let depth = 0
  let end   = -1
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) throw new Error('Unclosed JSON object in response')

  const jsonStr = stripped.slice(start, end + 1)
  return JSON.parse(jsonStr)
}

function validateEdits(parsed: unknown): TailorOutput {
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not an object')
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.edits)) throw new Error('Missing "edits" array')
  for (const e of obj.edits) {
    const edit = e as Record<string, unknown>
    if (typeof edit.bulletId !== 'string') throw new Error(`Edit missing bulletId: ${JSON.stringify(e)}`)
    if (typeof edit.newText  !== 'string') throw new Error(`Edit missing newText: ${JSON.stringify(e)}`)
  }
  return obj as unknown as TailorOutput
}

// ── Main handler ─────────────────────────────────────────────────
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

    console.log('[TAILOR API] Total bullets:', allBullets.length)
    if (allBullets.length === 0) {
      return Response.json({ error: 'No bullets found.' }, { status: 400 })
    }

    const systemPrompt =
      'You are a professional resume writer who rewrites bullets WITHOUT changing facts. ' +
      'You NEVER invent new projects, tools, companies or metrics. You ONLY output raw valid JSON — no prose, no markdown, no explanation.'

    const bulletsList = allBullets
      .map(b => `{"id":"${b.id}","text":${JSON.stringify(b.text)}}`)
      .join(', ')

    const userPrompt =
      `Return ONLY a JSON object: {"edits":[{"bulletId":"...","newText":"...","reason":"..."}]}\n\n` +
      `TASK: Lightly rewrite each resume bullet to better match the job description keywords.\n` +
      `STRICT RULES:\n` +
      `1. PRESERVE the original subject — same project name, same technology, same achievement\n` +
      `2. NEVER invent new projects, tools, or metrics that are not in the original bullet\n` +
      `3. Only change wording to mirror job description keywords — do not change facts\n` +
      `4. If a bullet already fits well, return it unchanged\n` +
      `5. One edit per bullet, same bullet count in output as input\n\n` +
      `JOB DESCRIPTION:\n${jobDescription.slice(0, 1500)}\n\n` +
      `BULLETS TO REWRITE (keep the same meaning, just improve keyword match):\n[${bulletsList}]`

    let lastError: Error | null = null

    for (const model of FREE_MODELS) {
      try {
        console.log('[TAILOR API] Trying:', model)
        const raw    = await callOpenRouter(model, systemPrompt, userPrompt)
        console.log('[TAILOR API] Raw response preview:', raw.slice(0, 200))
        const parsed = extractJSON(raw)
        const result = validateEdits(parsed)
        console.log('[TAILOR API] ✓', model, '— edits:', result.edits.length)
        return Response.json({ object: result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[TAILOR API] ✗', model, '—', msg)
        lastError = err instanceof Error ? err : new Error(msg)
      }
    }

    throw lastError ?? new Error('All models failed')

  } catch (error) {
    console.error('[TAILOR API] Fatal:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}