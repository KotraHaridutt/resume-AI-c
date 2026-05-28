// src/app/api/tailor/route.ts  (HTML approach)
export const runtime     = 'edge'
export const maxDuration = 60

const OPENAI_KEY  = process.env.OPENAI_API_KEY  as string
const GEMINI_KEY  = process.env.GEMINI_API_KEY  as string

interface TailorEdit {
  bulletId: string
  newText:  string
  reason:   string
}

function extractJSON(raw: string): unknown {
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim()
  const start    = stripped.indexOf('{')
  if (start === -1) throw new Error('No JSON found')
  let depth = 0, end = -1
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('Unclosed JSON')
  return JSON.parse(stripped.slice(start, end + 1))
}

function validateEdits(parsed: unknown): { edits: TailorEdit[] } {
  const obj = parsed as any
  if (!Array.isArray(obj?.edits)) throw new Error('Missing edits array')
  return obj
}

function buildPrompt(bullets: { id: string; text: string }[], jd: string): string {
  const list = bullets.map(b => `{"id":"${b.id}","text":${JSON.stringify(b.text)}}`).join(',\n  ')
  return (
    `Return ONLY this JSON: {"edits":[{"bulletId":"...","newText":"...","reason":"..."}]}\n\n` +
    `TASK: Minimally reword each bullet to include keywords from the job description.\n\n` +
    `STRICT RULES:\n` +
    `1. Keep the SAME sentence structure — do not add new clauses or trailing phrases\n` +
    `2. NEVER add words like "demonstrating", "to production", "leveraging" unless already in the original\n` +
    `3. NEVER change a verb — if original says "Shipped", newText must say "Shipped" not "Deployed"\n` +
    `4. Only swap/insert keywords from the JD — nothing else changes\n` +
    `5. If bullet already matches JD well — return it EXACTLY unchanged\n` +
    `6. newText must be within 20% of original word count\n` +
    `7. One edit per bullet, same count in and out\n` +
    `8. VERY IMPORTANT: Wrap any inserted or modified keywords from the job description in **double asterisks** to make them bold (e.g. **Machine Learning**)\n\n` +
    `JOB DESCRIPTION:\n${jd.slice(0, 1500)}\n\n` +
    `BULLETS:\n[${list}]`
  )
}

async function tryOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_KEY) throw new Error('No OpenAI key')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a resume writer. Output ONLY raw valid JSON.' },
        { role: 'user',   content: prompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const d = await res.json()
  return d.choices?.[0]?.message?.content ?? ''
}

async function tryGemini(prompt: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('No Gemini key')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8000, responseMimeType: 'application/json' },
      }),
    }
  )
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (res.status === 503) throw new Error('OVERLOADED')
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const d = await res.json()
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export async function POST(req: Request) {
  try {
    const { bullets, jobDescription } = await req.json() as {
      bullets:        { id: string; text: string }[]
      jobDescription: string
    }

    if (!bullets?.length) return Response.json({ error: 'No bullets provided' }, { status: 400 })

    console.log('[TAILOR API] Bullets:', bullets.length)

    // Chunk bullets to avoid token limits — 10 bullets per chunk
    const CHUNK_SIZE = 10
    const allEdits: { bulletId: string; newText: string; reason: string }[] = []

    for (let i = 0; i < bullets.length; i += CHUNK_SIZE) {
      const chunk  = bullets.slice(i, i + CHUNK_SIZE)
      const prompt = buildPrompt(chunk, jobDescription)
      console.log(`[TAILOR API] Processing chunk ${Math.floor(i/CHUNK_SIZE)+1}, bullets ${i+1}-${i+chunk.length}`)

      let raw = ''
      try {
        raw = await tryOpenAI(prompt)
        console.log('[TAILOR API] Chunk used OpenAI')
      } catch (e) {
        console.warn('[TAILOR API] OpenAI failed, trying Gemini:', (e as Error).message)
        try {
          raw = await tryGemini(prompt)
          console.log('[TAILOR API] Chunk used Gemini')
        } catch (e2) {
          const msg = (e2 as Error).message
          if (msg === 'RATE_LIMIT') return Response.json({ error: 'Rate limit — wait 1 minute and retry' }, { status: 429 })
          if (msg === 'OVERLOADED') return Response.json({ error: 'AI busy — try again in 30 seconds' }, { status: 503 })
          throw e2
        }
      }

      const result = validateEdits(extractJSON(raw))
      allEdits.push(...result.edits)
    }

    console.log('[TAILOR API] ✓ total edits:', allEdits.length)
    return Response.json({ edits: allEdits })

  } catch (err) {
    console.error('[TAILOR API] Fatal:', err)
    return Response.json({ error: (err as Error).message ?? 'Unknown error' }, { status: 500 })
  }
}