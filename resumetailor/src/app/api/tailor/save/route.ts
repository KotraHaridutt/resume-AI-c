import { auth } from '@clerk/nextjs/server'
import { db } from '@/DB'
import { tailorRuns } from '@/DB/schema'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { resumeId, jdText, aiEditsJson, modelUsed } = await req.json()

  // Extract job title + company from JD text (basic heuristic)
  // In Phase 3 you can use AI to extract these properly
  const firstLine = jdText.split('\n')[0]?.slice(0, 100) || ''

  const [run] = await db
    .insert(tailorRuns)
    .values({
      resumeId,
      userId,
      jdText,
      aiEditsJson,
      modelUsed,
      jobTitle:  firstLine,  // improve with AI extraction later
      company:   '',
      status:    'applied',
    })
    .returning()

  return Response.json({ runId: run.id }) 
}