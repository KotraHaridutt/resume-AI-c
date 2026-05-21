// src/types/html-resume.ts
// New type system for HTML-based resume approach

export interface ResumeBullet {
  id:       string   // e.g. "b-0", "b-1" — unique across entire resume
  text:     string   // original text — never mutate
  sectionId: string  // which section this belongs to
}

export interface HtmlResume {
  html:    string          // full HTML string of the resume
  bullets: ResumeBullet[]  // all editable bullets extracted from HTML
  name:    string          // candidate name — for PDF filename
}

export type BulletStatus = 'original' | 'changed' | 'accepted'

export interface BulletState {
  status:  BulletStatus
  current: string
}

export type BulletStateMap = Record<string, BulletState>