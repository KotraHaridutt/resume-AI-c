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
  const finalResume = {
    ...original,
    experience:  mergeBullets(original.experience,        rightState),
    projects:    mergeBullets(original.projects ?? [],    rightState),
    activities:  mergeBullets(original.activities ?? [],  rightState),
  }

  const skillsState = rightState['skills-section']
  if (skillsState?.status === 'accepted') {
    // Break the accepted text back down into an array of strings by splitting the bullets
    finalResume.skills = skillsState.current
      .split('•')
      .map(s => s.trim())
      .filter(Boolean)
  }

  return finalResume
}

export function getAcceptedIds(rightState: RightPaneState): string[] {
  return Object.entries(rightState)
    .filter(([, s]) => s.status === 'accepted')
    .map(([id]) => id)
}