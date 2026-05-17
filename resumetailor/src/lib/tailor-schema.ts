// src/lib/tailor-schema.ts — make sure both are named exports
import { z } from 'zod'

export const editSchema = z.object({
  bulletId: z.string(),
  newText:  z.string(),
  reason:   z.string(),
})

export const tailorSchema = z.object({
  edits: z.array(editSchema),
})

export type TailorEdit   = z.infer<typeof editSchema>
export type TailorOutput = z.infer<typeof tailorSchema>