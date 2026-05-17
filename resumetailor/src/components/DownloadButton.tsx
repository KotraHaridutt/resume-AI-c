'use client'

interface Props {
  onClick:      () => void
  isGenerating: boolean
  acceptedCount: number
  error:        string | null
}

export function DownloadButton({ onClick, isGenerating, acceptedCount, error }: Props) {
  const hasAccepted = acceptedCount > 0

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={!hasAccepted || isGenerating}
        title={
          !hasAccepted
            ? "Accept at least one AI suggestion first"
            : `Download PDF with ${acceptedCount} accepted change${acceptedCount > 1 ? 's' : ''}`
        }
        className={`
          flex items-center gap-1.5 text-xs px-4 py-1.5 rounded font-medium
          transition-all duration-150
          ${hasAccepted && !isGenerating
            ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }
        `}
      >
        {isGenerating ? (
          <>
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating PDF...
          </>
        ) : (
          <>
            <span>⬇</span>
            {hasAccepted
              ? `Download PDF (${acceptedCount} change${acceptedCount !== 1 ? 's' : ''})`
              : 'Download PDF'
            }
          </>
        )}
      </button>

      {error && (
        <span className="text-xs text-red-500">
          ⚠ {error}
        </span>
      )}
    </div>
  )
}