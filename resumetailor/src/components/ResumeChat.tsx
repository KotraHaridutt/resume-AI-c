'use client'

import { useState, useRef, useEffect } from 'react'
import type { ResumeJSON, RightPaneState } from '@/types/resume'
import type { TailorOutput } from '@/lib/tailor-schema'

interface ResumeChatProps {
  resume: ResumeJSON
  setRightState: React.Dispatch<React.SetStateAction<RightPaneState>>
  jd: string
  onJdChange: (jd: string) => void
  onTailor: () => void
  isTailoring: boolean
}

export function ResumeChat({ resume, setRightState, jd, onJdChange, onTailor, isTailoring }: ResumeChatProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    {
      role: 'assistant',
      content: 'Hi! I can help you edit your resume. Tell me what changes you would like to make (e.g. "Shorten the first bullet of my latest role" or "Emphasize my leadership skills").',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [jdExpanded, setJdExpanded] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = input.trim()
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setInput('')
    setIsLoading(true)

    // Hit the chat API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, prompt: userMessage })
      })

      if (!response.ok) throw new Error('Failed to fetch from chat API')
      const data = await response.json()
      
      if (data.object?.edits) {
        const edits = data.object.edits as TailorOutput['edits']
        
        let changedCount = 0
        const reasons: string[] = []
        
        setRightState(prev => {
          const next = { ...prev }
          const allBullets = [
            ...resume.experience.flatMap(e => e.bullets),
            ...(resume.projects ?? []).flatMap(p => p.bullets),
            ...(resume.activities ?? []).flatMap(a => a.bullets),
          ]
          if (resume.skills && resume.skills.length > 0) {
            allBullets.push({ id: 'skills-section', text: resume.skills.join(' • ') })
          }

          edits.forEach(edit => {
            if (!edit.bulletId || typeof edit.newText !== 'string') return
            const original = allBullets.find(b => b.id === edit.bulletId)
            if (original && edit.newText.trim() !== original.text.trim()) {
              next[edit.bulletId] = { status: 'changed', current: edit.newText }
              changedCount++
              if (edit.reason) reasons.push(edit.reason)
            }
          })
          return next
        })

        const content = changedCount > 0 
          ? `I've applied ${changedCount} edit${changedCount === 1 ? '' : 's'}. Check the tailored version!` + 
            (reasons.length > 0 ? `\n\nNotes:\n${reasons.map(r => `• ${r}`).join('\n')}` : '')
          : "I couldn't make any changes based on that prompt."

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content,
          },
        ])
      } else {
         setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: "Sorry, I couldn't make any changes based on that prompt.",
          },
        ])
      }
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, an error occurred while processing your request.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-700 font-sans tracking-wide">
          💬 AI Resume Assistant
        </h2>
        <p className="text-xs text-gray-500 mt-1">Prompt for specific edits</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col max-w-[85%] ${
              m.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
            }`}
          >
            <div
              className={`px-3 py-2 rounded-lg text-[13px] leading-relaxed shadow-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200'
              }`}
            >
              {m.content}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 px-1">
              {m.role === 'user' ? 'You' : 'AI Assistant'}
            </span>
          </div>
        ))}
        {isLoading && (
          <div className="mr-auto max-w-[85%]">
            <div className="px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-400 text-[13px] rounded-bl-none italic">
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0 flex flex-col gap-3">
        {jdExpanded ? (
          <div className="flex flex-col gap-2 bg-blue-50/50 border border-blue-100 rounded-lg p-3">
            <div className="flex justify-between items-center text-[11px] text-blue-800 font-semibold uppercase tracking-wide">
              <span>📋 Job Description Tailor</span>
              <button onClick={() => setJdExpanded(false)} className="text-blue-400 hover:text-blue-700">✕ Close</button>
            </div>
            <textarea 
              value={jd} 
              onChange={e => onJdChange(e.target.value)} 
              placeholder="Paste the full job description here..."
              className="w-full h-28 text-[13px] border border-blue-200 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none resize-none placeholder:text-gray-400 text-gray-700"
            />
            <button
              onClick={() => {
                setJdExpanded(false)
                onTailor()
              }}
              disabled={isTailoring || !jd.trim()}
              className="w-full px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isTailoring ? '✨ Tailoring Resume...' : '✨ Tailor Entire Resume to Job'}
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setJdExpanded(true)}
            className="text-xs text-blue-700 bg-blue-50 border border-blue-100 py-1.5 px-3 rounded shadow-sm hover:bg-blue-100 self-start flex items-center gap-1.5 transition-colors font-medium"
          >
            📋 Paste Job Description
          </button>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
            placeholder="Type your edit prompt..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}