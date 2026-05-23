'use client'

import { useState } from 'react'
import type { ResumeJSON, RightPaneState } from '@/types/resume'
import type { TailorOutput } from '@/lib/tailor-schema'

interface ResumeChatProps {
  resume: ResumeJSON
  setRightState: React.Dispatch<React.SetStateAction<RightPaneState>>
}

export function ResumeChat({ resume, setRightState }: ResumeChatProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    {
      role: 'assistant',
      content: 'Hi! I can help you edit your resume. Tell me what changes you would like to make (e.g. "Shorten the first bullet of my latest role" or "Emphasize my leadership skills").',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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

      <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0">
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