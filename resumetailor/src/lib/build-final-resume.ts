// src/lib/build-final-resume.ts

import type { ResumeJSON, RightPaneState } from '@/types/resume'

/**
 * Merges original resume + accepted right-pane state
 * into a clean final ResumeJSON for PDF export.
 *
 * Accepted bullets → use AI rewrite (rightState[id].current)
 * Everything else  → use original text (bullet.text)
 * Original is NEVER mutated.
 */
export function buildFinalResume(
  original:   ResumeJSON,
  rightState: RightPaneState
): ResumeJSON {
  return {
    ...original,
    experience: original.experience.map(exp => ({
      ...exp,
      bullets: exp.bullets.map(b => {
        const state = rightState[b.id]
        const useAI = state?.status === 'accepted'
        return {
          ...b,
          text: useAI ? state.current : b.text,
        }
      }),
    })),
  }
}

/** Returns bullet IDs the user accepted — saved to Neon on download */
export function getAcceptedIds(rightState: RightPaneState): string[] {
  return Object.entries(rightState)
    .filter(([, s]) => s.status === 'accepted')
    .map(([id]) => id)
}