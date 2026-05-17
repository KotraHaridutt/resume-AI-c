// src/hooks/useTailor.ts

'use client'
import { useEffect, useCallback, useRef } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import type { TailorOutput } from '@/lib/tailor-schema'
import { tailorSchema } from '@/lib/tailor-schema'
import type { ResumeJSON, RightPaneState } from '@/types/resume'

interface UseTailorProps {
  resume:        ResumeJSON
  setRightState: React.Dispatch<React.SetStateAction<RightPaneState>>
  onComplete?:   (edits: TailorOutput) => void
}

export function useTailor({ resume, setRightState, onComplete }: UseTailorProps) {
  const committedIds = useRef<Set<string>>(new Set())

  const { submit, object, isLoading, error, stop } = useObject<TailorOutput>({
    api:    '/api/tailor',
    schema: tailorSchema,
    credentials: 'include', // ensure cookies (Clerk session) are sent with the request
  })

  // `useObject` returns a DeepPartial<RESULT> at runtime but the SDK types
  // may not be resolved in the editor if deps aren't installed. Cast here
  // so we can safely access `edits` while preserving runtime behavior.
  const typedObject = object as unknown as Partial<TailorOutput> | undefined

  // ── While streaming: update right pane word by word ──────────────
  useEffect(() => {
    if (!typedObject?.edits) return

    // object.edits is DeepPartial<TailorEdit[]> while streaming
    // so every field access needs optional chaining
    const edits = typedObject.edits as Array<{ bulletId?: string; newText?: string } | undefined>

    edits.forEach(edit => {
      const id      = edit?.bulletId
      const newText = edit?.newText

      if (!id || !newText) return

      // Only update if not already committed (avoids flicker on re-renders)
      if (!committedIds.current.has(id)) {
        setRightState(prev => ({
          ...prev,
          [id]: { status: 'streaming', current: newText },
        }))
      }
    })
  }, [object, setRightState])

  // ── When streaming finishes: commit all edits ─────────────────────
  useEffect(() => {
    if (isLoading) return                     // still streaming, do nothing
    if (!typedObject?.edits?.length) return        // no edits came back

    const allBullets = resume.experience.flatMap(e => e.bullets)
    const edits      = typedObject.edits as Array<{ bulletId?: string; newText?: string; reason?: string } | undefined>

    setRightState(prev => {
      const next = { ...prev }

      edits.forEach(edit => {
        const id      = edit?.bulletId
        const newText = edit?.newText
        if (!id || !newText) return

        const original = allBullets.find(b => b.id === id)
        if (!original) return

        if (newText.trim() !== original.text.trim()) {
          // AI changed this bullet — show diff + accept/reject
          next[id] = { status: 'changed', current: newText }
          committedIds.current.add(id)
        } else {
          // AI left it the same — revert to original (no diff shown)
          next[id] = { status: 'original', current: original.text }
        }
      })

      return next
    })

    // Fire onComplete so EditorPage can save to Neon
    onComplete?.(typedObject as TailorOutput)

    // Reset for next tailor run
    committedIds.current = new Set()

  }, [isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── tailor() — called when user clicks "Tailor with AI" ──────────
  const tailor = useCallback((jobDescription: string, resumeId: string) => {
    // Reset all non-accepted bullets back to original before starting
    setRightState(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status === 'accepted') return // keep accepted ones
        const original = resume.experience.flatMap(e => e.bullets).find(b => b.id === id)
        if (original) next[id] = { status: 'original', current: original.text }
      })
      return next
    })

    committedIds.current = new Set()
    submit({ resume, jobDescription, resumeId })
  }, [resume, setRightState, submit])

  return { tailor, isLoading, error, stop }
}