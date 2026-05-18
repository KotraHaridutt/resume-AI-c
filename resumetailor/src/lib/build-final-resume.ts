// src/lib/build-final-resume.ts

import type { ResumeJSON, RightPaneState, ResumeSection, ResumeExperience } from '@/types/resume'

function mergeBullets<T extends { bullets: { id: string; text: string }[] }>(
  sections: T[],
  rightState: RightPaneState
): T[] {
  return sections.map(section => ({
    ...section,
    bullets: section.bullets.map(b => {
      const state = rightState[b.id]
      return {
        ...b,
        text: state?.status === 'accepted' ? state.current : b.text,
      }
    }),
  }))
}

export function buildFinalResume(
  original:   ResumeJSON,
  rightState: RightPaneState
): ResumeJSON {
  return {
    ...original,
    experience:  mergeBullets(original.experience,        rightState),
    projects:    mergeBullets(original.projects ?? [],    rightState),
    activities:  mergeBullets(original.activities ?? [],  rightState),
  }
}

export function getAcceptedIds(rightState: RightPaneState): string[] {
  return Object.entries(rightState)
    .filter(([, s]) => s.status === 'accepted')
    .map(([id]) => id)
}