'use client'
import { useState, useCallback } from 'react'
import { A4Page, SectionTitle } from '@/components/A4Page'
import { ResumeBulletRow } from '@/components/ResumeBulletRow'
import { JDInput } from '@/components/JDInput'
import { useTailor } from '@/hooks/useTailor'
import { ResumeUpload } from '@/components/ResumeUpload'
import type { ResumeJSON, RightPaneState } from '@/types/resume'

function initRightState(resume: ResumeJSON): RightPaneState {
  const state: RightPaneState = {}
  resume.experience.forEach(exp =>
    exp.bullets.forEach(b => {
      state[b.id] = { status: 'original', current: b.text }
    })
  )
  return state
}

// ── Separate component so useTailor is always called ──────────────────
interface EditorContentProps {
  resume:        ResumeJSON
  rightState:    RightPaneState
  setRightState: React.Dispatch<React.SetStateAction<RightPaneState>>
  jd:            string
  jdOpen?:       boolean
  onRunIdChange: (id: string) => void
  onJdChange?:   (jd: string) => void
  onJdToggle?:   () => void
  onResumeChange?: () => void
}

function EditorContent({ 
  resume, 
  rightState, 
  setRightState, 
  jd, 
  jdOpen,
  onRunIdChange,
  onJdChange,
  onJdToggle,
  onResumeChange,
}: EditorContentProps) {
  // ── Phase 2: AI streaming hook (always called in this component) ──────────────────────────────────
  const { tailor, isLoading, error: aiError, stop } = useTailor({
    resume,
    setRightState,
    onComplete: async (edits) => {
      // Save this tailor run to Neon after streaming finishes
      const res = await fetch('/api/tailor/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId:    'sample-resume-id', // replace with real DB id later
          jdText:      jd,
          aiEditsJson: edits,
          modelUsed:   'nvidia/nemotron-3-nano-30b-a3b:free',
        }),
      })
      const data = await res.json()
      onRunIdChange(data.runId) // store so Phase 3 download can update this row
    },
  })

  // ── Accept a single bullet ──────────────────────────────────────
  const acceptBullet = useCallback((id: string) => {
    setRightState(prev => ({
      ...prev,
      [id]: { ...prev[id], status: 'accepted' },
    }))
  }, [])

  // ── Reject a single bullet — reverts to original text ──────────
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

  // ── Accept all pending changes ──────────────────────────────────
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

  // ── Counts for toolbar ──────────────────────────────────────────
  const pendingCount  = Object.values(rightState).filter(s => s.status === 'changed').length
  const acceptedCount = Object.values(rightState).filter(s => s.status === 'accepted').length

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0 gap-3">
        <span className="font-bold text-sm text-blue-600 flex-shrink-0">
          ResumeTailor
        </span>

        {/* Resume name chip + change button */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full">
            <span className="text-xs text-gray-600 max-w-[160px] truncate">
              📄 {resume.name}
            </span>
            <button
              onClick={onResumeChange}
              className="text-[10px] text-gray-400 hover:text-red-400 ml-1"
              title="Upload a different resume"
            >
              ✕
            </button>
          </div>
        

        {/* centre — status messages */}
        <div className="flex items-center gap-3 flex-1 justify-center">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              AI is tailoring your resume...
              <button onClick={stop} className="text-red-400 underline ml-1">
                stop
              </button>
            </div>
          )}
          {!isLoading && pendingCount > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} to review
            </span>
          )}
          {!isLoading && pendingCount === 0 && acceptedCount > 0 && (
            <span className="text-xs text-green-600">
              ✓ {acceptedCount} change{acceptedCount !== 1 ? 's' : ''} accepted — ready to download
            </span>
          )}
          {aiError && (
            <span className="text-xs text-red-500">
              ⚠ {aiError.message}
            </span>
          )}
        </div>

        {/* right — action buttons */}
        <div className="flex gap-2 flex-shrink-0">
          {pendingCount > 0 && (
            <button
              onClick={acceptAll}
              className="text-xs px-3 py-1.5 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
            >
              ✓ Accept All
            </button>
          )}

          {/* Tailor button — disabled if JD is empty or AI is running */}
          <button
            onClick={() => jd.trim() && tailor(jd, 'sample-resume-id')}
            disabled={isLoading || !jd.trim()}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Tailoring...' : '✨ Tailor with AI'}
          </button>

          {/* Download — placeholder, Phase 3 replaces this with DownloadButton */}
          <button
            disabled={acceptedCount === 0}
            className="text-xs px-3 py-1.5 rounded bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title="PDF export wired up in Phase 3"
          >
            ⬇ Download PDF
          </button>
        </div>
      </div>

      {/* ── JD Input panel (collapsible) ── */}
      <JDInput
        value={jd}
        onChange={onJdChange || (() => {})}
        open={jdOpen ?? true}
        onToggle={onJdToggle || (() => {})}
      />

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

          {/* Legend — only appears once AI has made changes */}
          {Object.values(rightState).some(s => s.status !== 'original') && (
            <div className="flex gap-3 justify-center mb-3 text-[10px] text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-100 inline-block" /> Added
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-100 inline-block" /> Removed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200 inline-block" /> Pending
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

export default function EditorPage() {
  // null means "no resume yet" — show upload screen
  // Once PDF is parsed, this holds the user's actual resume
  const [resume, setResume]         = useState<ResumeJSON | null>(null)
  const [rightState, setRightState] = useState<RightPaneState>({})
  const [jd, setJd]                 = useState('')
  const [jdOpen, setJdOpen]         = useState(true)
  const [runId, setRunId]           = useState<string | null>(null)

  // Called by ResumeUpload when PDF is successfully parsed
  const handleResumeParsed = useCallback((parsed: ResumeJSON) => {
    setResume(parsed)
    setRightState(initRightState(parsed))
  }, [])

  // ── Show upload screen if no resume yet ──────────────────────
  if (!resume) {
    return (
      <div className="h-screen bg-gray-50">
        <ResumeUpload onParsed={handleResumeParsed} />
      </div>
    )
  }

  // ── Phase 2: render editor with hook that's always called ──────────────────────────────────
  return (
    <EditorContent
      resume={resume}
      rightState={rightState}
      setRightState={setRightState}
      jd={jd}
      jdOpen={jdOpen}
      onJdChange={setJd}
      onJdToggle={() => setJdOpen(o => !o)}
      onResumeChange={() => {
        setResume(null)
        setRightState({})
        setJd('')
        setRunId(null)
      }}
      onRunIdChange={setRunId}
    />
  )
}

// ── Shared resume renderer ────────────────────────────────────────
// Used by BOTH panes with the same resume prop.
// Left pane:  rightState and callbacks are undefined → shows original only
// Right pane: receives rightState + callbacks → shows diff/streaming/accepted
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
              state={rightState?.[b.id]}
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