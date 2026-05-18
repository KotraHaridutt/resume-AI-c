// src/hooks/useTailor.ts

'use client'
import { useCallback, useRef, useState } from 'react'
import type { TailorOutput } from '@/lib/tailor-schema'
import type { ResumeJSON, RightPaneState } from '@/types/resume'

interface UseTailorProps {
  resume:        ResumeJSON
  setRightState: React.Dispatch<React.SetStateAction<RightPaneState>>
  onComplete?:   (edits: TailorOutput) => void
}

// Helper: collect ALL bullets across experience, projects, activities
function getAllBullets(resume: ResumeJSON) {
  return [
    ...resume.experience.flatMap(e => e.bullets),
    ...(resume.projects  ?? []).flatMap(p => p.bullets),
    ...(resume.activities ?? []).flatMap(a => a.bullets),
  ]
}

export function useTailor({ resume, setRightState, onComplete }: UseTailorProps) {
  const committedIds = useRef<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>()
  const abortControllerRef = useRef<AbortController | null>(null)

  const tailor = useCallback(async (jobDescription: string, resumeId: string) => {
    console.log('[useTailor] tailor() called, JD length:', jobDescription.length)
    console.log('[useTailor] resume sections — exp:', resume.experience?.length,
      'projects:', resume.projects?.length, 'activities:', resume.activities?.length)

    const allBullets = getAllBullets(resume)
    console.log('[useTailor] Total bullets across all sections:', allBullets.length)

    // Reset all non-accepted bullets back to original
    setRightState(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status === 'accepted') return
        const original = allBullets.find(b => b.id === id)
        if (original) next[id] = { status: 'original', current: original.text }
      })
      return next
    })

    committedIds.current = new Set()
    setIsLoading(true)
    setError(undefined)

    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/tailor', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resume, jobDescription, resumeId }),
        signal:  abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`API error ${response.status}: ${errText}`)
      }

      const data = await response.json()
      console.log('[useTailor] Response received, edits count:', data.object?.edits?.length)

      if (!data.object?.edits?.length) {
        throw new Error('AI returned no edits. Check the model and prompt in route.ts.')
      }

      const tailorOutput = data.object as TailorOutput
      const edits = tailorOutput.edits

      setRightState(prev => {
        const next = { ...prev }
        edits.forEach(edit => {
          const { bulletId: id, newText } = edit
          if (!id || !newText) return
          const original = allBullets.find(b => b.id === id)
          if (!original) {
            console.warn('[useTailor] No matching bullet for id:', id)
            return
          }
          if (newText.trim() !== original.text.trim()) {
            next[id] = { status: 'changed', current: newText }
            committedIds.current.add(id)
          } else {
            next[id] = { status: 'original', current: original.text }
          }
        })
        return next
      })

      onComplete?.(tailorOutput)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[useTailor] Error:', err)
        setError(err)
      }
    } finally {
      setIsLoading(false)
    }
  }, [resume, setRightState, onComplete])

  const stop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  return { tailor, isLoading, error, stop }
}