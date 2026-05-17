import { auth } from '@clerk/nextjs/server'
import { db } from '@/DB'
import { tailorRuns } from '@/DB/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { runId, tailoredJson, acceptedIds } = await req.json()

  await db
    .update(tailorRuns)
    .set({
      tailoredJson,                    // final resume JSON with accepted edits applied
      acceptedIds,                     // array of bullet IDs user accepted
      downloadedAt: new Date(),        // mark as downloaded
    })
    .where(
      and(
        eq(tailorRuns.id, runId),
        eq(tailorRuns.userId, userId), // security: only update own rows
      )
    )

  return Response.json({ ok: true })
}