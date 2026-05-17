// src/components/ResumeUpload.tsx

'use client'
import { useState, useRef } from 'react'
import type { ResumeJSON } from '@/types/resume'

interface ResumeUploadProps {
  onParsed: (resume: ResumeJSON) => void
}

export function ResumeUpload({ onParsed }: ResumeUploadProps) {
  const [isParsing, setIsParsing]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setError('Please upload a PDF file')
      return
    }

    setError(null)
    setIsParsing(true)
    setFileName(file.name)

    try {
      const formData = new FormData()
      formData.append('resume', file)

      const res  = await fetch('/api/resume/parse', {
        method: 'POST',
        body:   formData,
        // No Content-Type header — browser sets it automatically with boundary
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse resume')
      }

      onParsed(data.resume)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setFileName(null)
    } finally {
      setIsParsing(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12">
      {/* Main card */}
      <div className="w-full max-w-lg">

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">
          ResumeTailor
        </h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          Upload your resume, paste a job description, and let AI tailor it live
        </p>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={[
            'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleInputChange}
          />

          {isParsing ? (
            // Parsing state
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-blue-600">
                Reading your resume...
              </p>
              <p className="text-xs text-gray-400">
                AI is extracting and structuring your experience
              </p>
            </div>
          ) : fileName ? (
            // File selected state
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 text-lg">✓</span>
              </div>
              <p className="text-sm font-medium text-gray-700">{fileName}</p>
              <p className="text-xs text-gray-400">Click to upload a different file</p>
            </div>
          ) : (
            // Default empty state
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">📄</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  Drop your resume here
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  or click to browse — PDF only, max 5MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">⚠ {error}</p>
          </div>
        )}

        {/* Tips */}
        <div className="mt-6 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Tips for best results
          </p>
          <ul className="space-y-1">
            {[
              'Use a text-based PDF, not a scanned image',
              'Single-column layouts parse most accurately',
              'Your data never leaves the session — nothing is stored without your action',
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                <span className="text-gray-300 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}