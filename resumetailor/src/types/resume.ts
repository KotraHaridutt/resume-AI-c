export interface ResumeBullet {
  id:   string   // unique e.g. "exp-0-b-0" — never changes
  text: string   // original text — NEVER mutate this
}

export interface ResumeExperience {
  id:      string
  role:    string
  company: string
  date:    string
  bullets: ResumeBullet[]
}

export interface ResumeSection {
  id:      string
  title:   string        
  subtitle?: string         
  date?:   string
  bullets: ResumeBullet[]
}

export interface ResumeJSON {
  name:       string
  contact:    string
  objective?: string        
  experience: ResumeExperience[]   
  projects:   ResumeSection[]      
  skills:     string[]
  education:  {
    degree: string
    school: string
    year:   string
  }
  activities?: ResumeSection[] 
}


// ── Right pane state ─────────────────────────────────────────────
// Completely separate from ResumeJSON — original is never touched

export type BulletStatus =
  | 'original'   // unchanged, same as left pane
  | 'streaming'  // AI is currently writing this bullet
  | 'changed'    // AI finished — diff shown, awaiting user decision
  | 'accepted'   // user clicked ✓ — use AI version in PDF

export interface BulletState {
  status:  BulletStatus
  current: string   // what the right pane renders
}

// Keyed by bullet id
export type RightPaneState = Record<string, BulletState>