'use client'

interface Props {
  value:    string
  onChange: (v: string) => void
  open:     boolean
  onToggle: () => void
}

export function JDInput({ value, onChange, open, onToggle }: Props) {
  const wordCount = value.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="bg-white border-b border-gray-200 flex-shrink-0">

      {/* Header bar — always visible */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">📋 Job Description</span>
          {value.trim() && (
            <span className="text-[10px] text-gray-400">{wordCount} words pasted</span>
          )}
          {!value.trim() && (
            <span className="text-[10px] text-amber-500">← paste JD here first</span>
          )}
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲ collapse' : '▼ expand'}</span>
      </div>

      {/* Expandable textarea */}
      {open && (
        <div className="px-4 pb-3">
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Paste the full job description here. The AI will scan it for keywords and rewrite your resume bullets to match.\n\nTip: copy the entire JD — requirements, responsibilities, and preferred qualifications all help."
            className="w-full h-32 text-xs text-gray-700 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
          />
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-[10px] text-gray-400">
              No link scraping — paste the text directly to avoid bot blocks
            </span>
            {value.trim() && (
              <button
                onClick={() => { onChange(''); }}
                className="text-[10px] text-gray-400 hover:text-red-400">
                clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}