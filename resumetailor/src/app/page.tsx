'use client'
import { useState, useCallback } from 'react'
import { A4Page, SectionTitle }   from '@/components/A4Page'
import { ResumeBulletRow }         from '@/components/ResumeBulletRow'
import { useTailor }               from '@/hooks/useTailor'
import { ResumeUpload }            from '@/components/ResumeUpload'
import { useDownload }             from '@/hooks/useDownload'
import { DownloadButton }          from '@/components/DownloadButton'
import { ResumeChat }              from '@/components/ResumeChat'
import type { ResumeJSON, RightPaneState } from '@/types/resume'
 
function initRightState(resume: ResumeJSON): RightPaneState {
  const state: RightPaneState = {}
  
  // Experience bullets
  resume.experience.forEach(exp =>
    exp.bullets.forEach(b => {
      state[b.id] = { status: 'original', current: b.text }
    })
  )
  
  // Project bullets — NEW
  resume.projects.forEach(proj =>
    proj.bullets.forEach(b => {
      state[b.id] = { status: 'original', current: b.text }
    })
  )

  // Activity bullets — NEW
  resume.activities?.forEach(act =>
    act.bullets.forEach(b => {
      state[b.id] = { status: 'original', current: b.text }
    })
  )

  // Skills as a single editable block
  if (resume.skills && resume.skills.length > 0) {
    state['skills-section'] = { status: 'original', current: resume.skills.join(' • ') }
  }

  return state
}

interface EditorContentProps {
  resume:          ResumeJSON
  rightState:      RightPaneState
  setRightState:   React.Dispatch<React.SetStateAction<RightPaneState>>
  jd:              string
  jdOpen:          boolean
  runId:           string | null   // ← ADD THIS — was missing
  onRunIdChange:   (id: string) => void
  onJdChange:      (jd: string) => void
  onJdToggle:      () => void
  onResumeChange:  () => void
}

function EditorContent({
  resume,
  rightState,
  setRightState,
  jd,
  jdOpen,
  runId,            // ← NOW RECEIVED AS PROP
  onRunIdChange,
  onJdChange,
  onJdToggle,
  onResumeChange,
}: EditorContentProps) {

  const { tailor, isLoading, error: aiError, stop } = useTailor({
    resume,
    setRightState,
    onComplete: async (edits) => {
      try {
        const res = await fetch('/api/tailor/save', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeId:    'user-resume',
            jdText:      jd,
            aiEditsJson: edits,
            modelUsed:   'google/gemini-3-flash-preview',
          }),
        })
        
        if (!res.ok) {
          console.error('[EditorContent] Save failed:', res.status, res.statusText)
          return
        }
        
        const data = await res.json()
        onRunIdChange(data.runId)
        console.log('[EditorContent] Tailor saved with runId:', data.runId)
      } catch (error) {
        console.error('[EditorContent] Error saving tailor:', error)
      }
    },
  })

  // runId now comes from props — no longer undefined
  const { download, isGenerating, error: dlError } = useDownload({
    original:   resume,
    rightState,
    runId,       // ← comes from props now, TypeScript happy
  })

  const acceptBullet = useCallback((id: string) => {
    setRightState(prev => ({
      ...prev,
      [id]: { ...prev[id], status: 'accepted' },
    }))
  }, [setRightState])

  const rejectBullet = useCallback((id: string) => {
    const allBullets = [
      ...resume.experience.flatMap(e => e.bullets),
      ...(resume.projects ?? []).flatMap(p => p.bullets),
      ...(resume.activities ?? []).flatMap(a => a.bullets),
    ]
    let originalText = ''
    if (id === 'skills-section') {
      originalText = resume.skills.join(' • ')
    } else {
      const originalBullet = allBullets.find(b => b.id === id)
      if (!originalBullet) return
      originalText = originalBullet.text
    }

    setRightState(prev => ({
      ...prev,
      [id]: { status: 'original', current: originalText },
    }))
  }, [resume, setRightState])

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
  }, [setRightState])

  const pendingCount  = Object.values(rightState).filter(s => s.status === 'changed').length
  const acceptedCount = Object.values(rightState).filter(s => s.status === 'accepted').length

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0 gap-3">

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-bold text-base text-blue-600">ResumeTailor</span>
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full">
            <span className="text-sm text-gray-600 max-w-[200px] truncate">
              📄 {resume.name}
            </span>
            <button
              onClick={onResumeChange}
              className="text-xs text-gray-400 hover:text-red-400 ml-1"
              title="Upload a different resume"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-center">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              AI is tailoring your resume...
              <button onClick={stop} className="text-red-400 underline ml-1">stop</button>
            </div>
          )}
          {!isLoading && pendingCount > 0 && (
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} to review
            </span>
          )}
          {!isLoading && pendingCount === 0 && acceptedCount > 0 && (
            <span className="text-sm text-green-600">
              ✓ {acceptedCount} accepted — ready to download
            </span>
          )}
          {(aiError || dlError) && (
            <span className="text-sm text-red-500">
              ⚠ {aiError?.message || dlError}
            </span>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {pendingCount > 0 && (
             <button
              onClick={acceptAll}
              className="text-sm px-4 py-2 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
            >
              ✓ Accept All
            </button>
          )}
          <DownloadButton
            onClick={download}
            isGenerating={isGenerating}
            acceptedCount={acceptedCount}
            error={dlError}
          />
        </div>
      </div>

      {/* JD Input removed from here, now inside ResumeChat */}

      {/* Split panes */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane: AI Chat */}
        <div className="w-1/3 min-w-[300px] border-r border-gray-300 bg-white">
          <ResumeChat 
            resume={resume} 
            rightState={rightState}
            setRightState={setRightState} 
            jd={jd}
            onJdChange={onJdChange}
            onTailor={() => jd.trim() && tailor(jd, 'user-resume')}
            isTailoring={isLoading}
          />
        </div>

        {/* Right pane: Preview */}
        <div className="flex-1 w-full overflow-y-auto bg-gray-100 p-5">
          <p className="text-center text-xs text-gray-400 uppercase tracking-widest mb-3 select-none font-medium">
            ✏️ AI tailored version
          </p>
          {Object.values(rightState).some(s => s.status !== 'original') && (
            <div className="flex gap-4 justify-center mb-4 text-xs text-gray-600 flex-wrap font-medium">
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-green-100 inline-block" /> Added</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-red-100 inline-block" /> Removed</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-yellow-50 border border-yellow-200 inline-block" /> Pending</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-green-50 border border-green-200 inline-block" /> Accepted</span>
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
  const [resume, setResume]         = useState<ResumeJSON | null>(null)
  const [rightState, setRightState] = useState<RightPaneState>({})
  const [jd, setJd]                 = useState('')
  const [jdOpen, setJdOpen]         = useState(true)
  const [runId, setRunId]           = useState<string | null>(null)

  const handleResumeParsed = useCallback((parsed: ResumeJSON) => {
    setResume(parsed)
    setRightState(initRightState(parsed))
  }, [])

  if (!resume) {
    return (
      <div className="h-screen bg-gray-50">
        <ResumeUpload onParsed={handleResumeParsed} />
      </div>
    )
  }

  return (
    <EditorContent
      resume={resume}
      rightState={rightState}
      setRightState={setRightState}
      jd={jd}
      jdOpen={jdOpen}
      runId={runId}           // ← passed down now
      onRunIdChange={setRunId}
      onJdChange={setJd}
      onJdToggle={() => setJdOpen(o => !o)}
      onResumeChange={() => {
        setResume(null)
        setRightState({})
        setJd('')
        setRunId(null)
      }}
    />
  )
}

function ResumeContent({
  resume, rightState, onAccept, onReject,
}: {
  resume:      ResumeJSON
  rightState?: RightPaneState
  onAccept?:   (id: string) => void
  onReject?:   (id: string) => void
}) {
  // Support both array (new parser) and single object (old parser) for education
  const allEducation: Array<{ degree: string; school: string; year: string; grade?: string }> =
    Array.isArray((resume as any).allEducation)
      ? (resume as any).allEducation
      : [resume.education]

  return (
    <>
      {/* Header */}
      <h1 className="text-[22px] sm:text-[24px] font-bold text-center text-gray-900 tracking-wide">
        {resume.name}
      </h1>
      <p className="text-[12px] sm:text-[13px] text-center text-gray-500 border-b-[1.5px] border-gray-800 pb-[10px] mb-[16px]">
        {resume.contact}
      </p>

      {/* Objective */}
      {resume.objective && (
        <>
          <SectionTitle>Objective</SectionTitle>
          <p className="text-[13px] sm:text-[14px] text-gray-700 mb-[12px] leading-relaxed">{resume.objective}</p>
        </>
      )}

      {/* Experience — only show section if there are entries */}
      {resume.experience.length > 0 && (
        <>
          <SectionTitle>Experience</SectionTitle>
          {resume.experience.map(exp => (
            <div key={exp.id} className="mb-[14px]">
              <div className="flex justify-between items-baseline mb-[2px]">
                <span className="text-[15px] sm:text-[16px] font-semibold text-gray-900">{exp.role}</span>
                <span className="text-[12px] sm:text-[13px] text-gray-600">{exp.date}</span>
              </div>
              <p className="text-[13px] sm:text-[14px] text-gray-700 mb-[6px]">{exp.company}</p>
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
        </>
      )}

      {/* Skills */}
      {resume.skills.length > 0 && (
        <>
          <SectionTitle>Skills</SectionTitle>
          <div className="mb-[8px]">
            <ResumeBulletRow
              originalText={resume.skills.join(' • ')}
              state={rightState?.['skills-section']}
              onAccept={() => onAccept?.('skills-section')}
              onReject={() => onReject?.('skills-section')}
            />
          </div>
        </>
      )}

      {/* Education — all degrees */}
      <SectionTitle>Education</SectionTitle>
      {allEducation.map((edu, i) => (
        <div key={i} className="mb-[10px]">
          <div className="flex justify-between items-baseline mb-[2px]">
            <span className="text-[15px] sm:text-[16px] font-semibold text-gray-900">{edu.degree}</span>
            <span className="text-[12px] sm:text-[13px] text-gray-600">{edu.year}</span>
          </div>
          <p className="text-[13px] sm:text-[14px] text-gray-700">{edu.school}</p>
          {edu.grade && (
            <p className="text-[12px] sm:text-[13px] text-gray-500 mt-[2px]">{edu.grade}</p>
          )}
        </div>
      ))}

      {/* Projects */}
      {resume.projects.length > 0 && (
        <>
          <SectionTitle>Projects</SectionTitle>
          {resume.projects.map(proj => (
            <div key={proj.id} className="mb-[14px]">
              <div className="flex justify-between items-baseline mb-[6px]">
                <span className="text-[15px] sm:text-[16px] font-semibold text-gray-900">{proj.title}</span>
                {proj.date && <span className="text-[12px] sm:text-[13px] text-gray-600">{proj.date}</span>}
              </div>
              {proj.bullets.map(b => (
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
        </>
      )}

      {/* Extra-Curricular Activities */}
      {resume.activities && resume.activities.length > 0 && (
        <>
          <SectionTitle>Extra-Curricular Activities</SectionTitle>
          {resume.activities.map(act => (
            <div key={act.id} className="mb-[8px]">
              {act.bullets.map(b => (
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
        </>
      )}
    </>
  )
}