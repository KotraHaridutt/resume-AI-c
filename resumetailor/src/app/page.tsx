// src/app/editor/page.tsx

'use client'
import { useState, useCallback } from 'react'
import { A4Page, SectionTitle } from '@/components/A4Page'
import { ResumeBulletRow } from '@/components/ResumeBulletRow'
import type { ResumeJSON, RightPaneState } from '@/types/resume'

// ── Sample resume — replace with DB fetch in Phase 2 ──────────────
const SAMPLE_RESUME: ResumeJSON = {
  name:    'Arjun Sharma',
  contact: 'arjun@email.com  •  +91 98765 43210  •  linkedin.com/in/arjunsharma  •  Hyderabad, IN',
  experience: [
    {
      id:      'exp-0',
      role:    'Software Engineer',
      company: 'TechCorp India Pvt Ltd',
      date:    'Jun 2022 – Present',
      bullets: [
        { id: 'exp-0-b-0', text: 'Built internal tools using Python and React that improved team productivity.' },
        { id: 'exp-0-b-1', text: 'Worked on database queries and helped reduce page load time by 20%.' },
        { id: 'exp-0-b-2', text: 'Participated in code reviews and contributed to documentation.' },
        { id: 'exp-0-b-3', text: 'Collaborated with cross-functional teams to deliver features on schedule.' },
      ],
    },
    {
      id:      'exp-1',
      role:    'Software Intern',
      company: 'StartupXYZ',
      date:    'Jan 2022 – May 2022',
      bullets: [
        { id: 'exp-1-b-0', text: 'Assisted in building REST APIs using Node.js and Express.' },
        { id: 'exp-1-b-1', text: 'Wrote unit tests and helped maintain test coverage above 80%.' },
      ],
    },
  ],
  skills:    ['Python', 'React', 'Node.js', 'SQL', 'Git', 'REST APIs'],
  education: {
    degree: 'B.Tech Computer Science',
    school: 'JNTU Hyderabad',
    year:   '2022',
  },
}

// ── Initialise right pane state from resume ───────────────────────
// Every bullet starts as 'original' — identical to the left pane
function initRightState(resume: ResumeJSON): RightPaneState {
  const state: RightPaneState = {}
  resume.experience.forEach(exp =>
    exp.bullets.forEach(b => {
      state[b.id] = { status: 'original', current: b.text }
    })
  )
  return state
}

// ── Main page ────────────────────────────────────────────────────
export default function EditorPage() {
  // original — the const here enforces that you never call setResume
  const [resume] = useState<ResumeJSON>(SAMPLE_RESUME)

  // Right pane state — completely separate from resume
  const [rightState, setRightState] = useState<RightPaneState>(
    () => initRightState(SAMPLE_RESUME)
  )

  // ── Accept a bullet — flip status to 'accepted', keep current text
  const acceptBullet = useCallback((id: string) => {
    setRightState(prev => ({
      ...prev,
      [id]: { ...prev[id], status: 'accepted' },
    }))
  }, [])

  // ── Reject a bullet — revert current text back to original
  const rejectBullet = useCallback((id: string) => {
    const originalBullet = resume.experience
      .flatMap(e => e.bullets)
      .find(b => b.id === id)

    if (!originalBullet) return

    setRightState(prev => ({
      ...prev,
      [id]: { status: 'original', current: originalBullet.text },
    }))
  }, [resume])

  // ── Accept all pending changes at once
  const acceptAll = useCallback(() => {
    setRightState(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status === 'changed') {
          next[id] = { ...next[id], status: 'accepted' }
        }
      })
      return next
    })
  }, [])

  // ── Counts for toolbar UI
  const pendingCount  = Object.values(rightState).filter(s => s.status === 'changed').length
  const acceptedCount = Object.values(rightState).filter(s => s.status === 'accepted').length

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0 gap-3">
        <span className="font-bold text-sm text-blue-600 flex-shrink-0">
          ResumeTailor
        </span>

        {/* centre — status messages */}
        <div className="flex items-center gap-3 flex-1 justify-center">
          {pendingCount > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} to review
            </span>
          )}
          {acceptedCount > 0 && pendingCount === 0 && (
            <span className="text-xs text-green-600">
              ✓ {acceptedCount} change{acceptedCount !== 1 ? 's' : ''} accepted — ready to download
            </span>
          )}
        </div>

        {/* right — actions */}
        <div className="flex gap-2 flex-shrink-0">
          {pendingCount > 0 && (
            <button
              onClick={acceptAll}
              className="text-xs px-3 py-1.5 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
            >
              ✓ Accept All
            </button>
          )}
          {/* Phase 2 wires this up — placeholder for now */}
          <button
            disabled
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white opacity-40 cursor-not-allowed"
            title="AI streaming — wired up in Phase 2"
          >
            ✨ Tailor with AI
          </button>
          {/* Phase 3 wires this up — placeholder for now */}
          <button
            disabled={acceptedCount === 0}
            className="text-xs px-3 py-1.5 rounded bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title="PDF export — wired up in Phase 3"
          >
            ⬇ Download PDF
          </button>
        </div>
      </div>

      {/* ── Split panes ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — locked original */}
        <div className="w-1/2 overflow-y-auto bg-gray-200 p-5 border-r border-gray-300">
          <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest mb-3 select-none">
            🔒 Original — locked
          </p>
          <A4Page locked>
            <ResumeContent resume={resume} />
          </A4Page>
        </div>

        {/* RIGHT — live AI edits */}
        <div className="w-1/2 overflow-y-auto bg-gray-100 p-5">
          <p className="text-center text-[10px] text-gray-400 uppercase tracking-widest mb-3 select-none">
            ✏️ AI tailored version
          </p>
          {/* Legend — only shows once there are changes */}
          {Object.values(rightState).some(s => s.status !== 'original') && (
            <div className="flex gap-3 justify-center mb-3 text-[10px] text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-100 inline-block" /> Added
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-100 inline-block" /> Removed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200 inline-block" /> Pending review
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-50 border border-green-200 inline-block" /> Accepted
              </span>
            </div>
          )}
          <A4Page>
            <ResumeContent
              resume={resume}
              rightState={rightState}
              onAccept={acceptBullet}
              onReject={rejectBullet}
            />
          </A4Page>
        </div>
      </div>
    </div>
  )
}

// ── Shared resume renderer ───────────────────────────────────────
// Used by BOTH left and right panes with the same resume data.
// Right pane additionally receives rightState + action callbacks.
function ResumeContent({
  resume,
  rightState,
  onAccept,
  onReject,
}: {
  resume:      ResumeJSON
  rightState?: RightPaneState
  onAccept?:   (id: string) => void
  onReject?:   (id: string) => void
}) {
  return (
    <>
      {/* Header */}
      <h1 className="text-[16px] font-bold text-center text-gray-900 tracking-wide">
        {resume.name}
      </h1>
      <p className="text-[8.5px] text-center text-gray-500 border-b-[1.5px] border-gray-800 pb-[8px] mb-[12px]">
        {resume.contact}
      </p>

      {/* Experience */}
      <SectionTitle>Experience</SectionTitle>
      {resume.experience.map(exp => (
        <div key={exp.id} className="mb-[10px]">
          <div className="flex justify-between items-baseline">
            <span className="text-[10.5px] font-semibold text-gray-900">{exp.role}</span>
            <span className="text-[8.5px] text-gray-500">{exp.date}</span>
          </div>
          <p className="text-[9px] text-gray-600 mb-[4px]">{exp.company}</p>
          {exp.bullets.map(b => (
            <ResumeBulletRow
              key={b.id}
              originalText={b.text}
              state={rightState?.[b.id]}          // undefined for left pane
              onAccept={() => onAccept?.(b.id)}
              onReject={() => onReject?.(b.id)}
            />
          ))}
        </div>
      ))}

      {/* Skills */}
      <SectionTitle>Skills</SectionTitle>
      <p className="text-[9px] text-gray-700">
        {resume.skills.join('  •  ')}
      </p>

      {/* Education */}
      <SectionTitle>Education</SectionTitle>
      <div className="flex justify-between items-baseline">
        <span className="text-[10.5px] font-semibold text-gray-900">{resume.education.degree}</span>
        <span className="text-[8.5px] text-gray-500">{resume.education.year}</span>
      </div>
      <p className="text-[9px] text-gray-600">{resume.education.school}</p>
    </>
  )
}