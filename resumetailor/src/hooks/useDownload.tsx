// src/hooks/useDownload.tsx  ← renamed to .tsx

'use client'
import { useState, useCallback } from 'react'
import { pdf } from '@react-pdf/renderer'
import { ResumePDF } from '@/components/pdf/ResumePDF'
import { buildFinalResume, getAcceptedIds } from '@/lib/build-final-resume'
import type { ResumeJSON, RightPaneState } from '@/types/resume'

interface UseDownloadProps {
  original:   ResumeJSON
  rightState: RightPaneState
  runId:      string | null
}

export function useDownload({ original, rightState, runId }: UseDownloadProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const download = useCallback(async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const finalResume = buildFinalResume(original, rightState)
      const acceptedIds = getAcceptedIds(rightState)

      // JSX works now because the file is .tsx
      const blob = await pdf(<ResumePDF resume={finalResume} />).toBlob()

      const safeName = finalResume.name
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
      const filename = `${safeName}_Tailored_Resume.pdf`

      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      if (runId) {
        await fetch('/api/tailor/accept', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId, tailoredJson: finalResume, acceptedIds }),
        })
      }
    } catch (err) {
      console.error('PDF generation failed:', err)
      setError(err instanceof Error ? err.message : 'PDF generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [original, rightState, runId])

  return { download, isGenerating, error }
}