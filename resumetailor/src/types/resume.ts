export interface ResumeBullet {
  id:   string
  text: string
}

export interface ResumeExperience {
  id:      string
  role:    string
  company: string
  date:    string
  bullets: ResumeBullet[]
}

export interface ResumeSection {
  id:       string
  title:    string
  subtitle?: string
  date?:    string
  bullets:  ResumeBullet[]
}

export interface ResumeEducation {
  degree: string
  school: string
  year:   string
  grade?: string   // ← CGPA, GPA, percentage etc.
}

export interface ResumeJSON {
  name:         string
  contact:      string
  objective?:   string
  experience:   ResumeExperience[]
  projects:     ResumeSection[]
  skills:       string[]
  education:    ResumeEducation      // primary (most recent) — used by PDF renderer
  allEducation?: ResumeEducation[]   // all entries — used for display
  activities?:  ResumeSection[]
}

export type BulletStatus =
  | 'original'
  | 'streaming'
  | 'changed'
  | 'accepted'

export interface BulletState {
  status:  BulletStatus
  current: string
}

export type RightPaneState = Record<string, BulletState>