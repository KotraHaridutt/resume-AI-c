// src/components/ResumeBulletRow.tsx

'use client'
import { wordDiff } from '@/lib/diff'
import type { BulletState } from '@/types/resume'

interface ResumeBulletRowProps {
  originalText: string
  state?:       BulletState   // undefined = left pane (show original only)
  onAccept?:    () => void
  onReject?:    () => void
}

/**
 * Renders a single resume bullet in either:
 *   - Left pane mode  (state = undefined): just shows original text
 *   - Right pane mode (state = BulletState):
 *       'original'  → plain text (AI didn't change this)
 *       'streaming' → partial text + blinking cursor (AI is typing)
 *       'changed'   → word-level diff + accept/reject buttons
 *       'accepted'  → clean AI text + green accepted badge
 */
export function ResumeBulletRow({
  originalText,
  state,
  onAccept,
  onReject,
}: ResumeBulletRowProps) {

  // ── HELPER TO PARSE BOLD ─────────────────────────────────
  const renderBoldText = (text: string) => {
    if (!text) return null
    return text.split('**').map((part, i) => {
      if (!part) return null
      if (i % 2 === 1) return <strong key={i} style={{ fontWeight: 700, WebkitFontSmoothing: 'antialiased' }} className="font-bold">{part}</strong>
      return <span key={i}>{part}</span>
    })
  }

  // ── LEFT PANE — no state prop ─────────────────────────────────
  if (!state) {
    if (!originalText || !originalText.trim()) return null
    return (
      <div className="flex gap-[8px] mb-[6px] items-start">
        <span className="mt-[6px] w-[5px] h-[5px] rounded-full bg-gray-500 flex-shrink-0" />
        <span className="text-sm leading-relaxed text-gray-800">{renderBoldText(originalText)}</span>
      </div>
    )
  }

  const { status, current } = state

  // ── RIGHT PANE — STREAMING (AI is typing) ────────────────────
  if (status === 'streaming') {
    return (
      <div className="flex gap-[8px] mb-[6px] items-start">
        <span className="mt-[6px] w-[5px] h-[5px] rounded-full bg-blue-400 flex-shrink-0 animate-pulse" />
        <span className="text-sm leading-relaxed text-blue-700 flex-1">
          {renderBoldText(current)}
          {/* blinking cursor */}
          <span className="inline-block w-[2px] h-[12px] bg-blue-500 ml-[2px] align-middle animate-pulse" />
        </span>
      </div>
    )
  }

  // ── RIGHT PANE — CHANGED (show diff + accept/reject) ─────────
  if (status === 'changed') {
    const spans = wordDiff(originalText, current)
    let isBoldDiff = false;

    return (
      <div className="flex gap-[8px] mb-[6px] items-start bg-yellow-50 rounded px-[6px] py-[4px]">
        <span className="mt-[6px] w-[5px] h-[5px] rounded-full bg-yellow-500 flex-shrink-0" />

        {/* diff text */}
        <span className="text-sm leading-relaxed flex-1 text-gray-800">
          {spans.map((span, i) => {
            const parts = span.text.split('**');
            const elements = parts.map((part, pIdx) => {
              const currentBold = isBoldDiff;
              if (pIdx < parts.length - 1) isBoldDiff = !isBoldDiff;
              if (!part) return null;
              
              const style = currentBold ? { fontWeight: 700, WebkitFontSmoothing: 'antialiased' as const } : undefined;
              return currentBold 
                ? <strong key={pIdx} style={style} className="font-bold">{part}</strong>
                : <span key={pIdx}>{part}</span>
            });

            if (span.type === 'insert') {
              return (
                <ins
                  key={i}
                  className="bg-green-100 text-green-800 no-underline rounded px-[3px]"
                >
                  {elements}{' '}
                </ins>
              )
            }
            if (span.type === 'delete') {
              return (
                <del
                  key={i}
                  className="bg-red-100 text-red-700 line-through rounded px-[3px]"
                >
                  {elements}{' '}
                </del>
              )
            }
            return <span key={i}>{elements} </span>
          })}
        </span>

        {/* accept / reject buttons */}
        <div className="flex gap-[4px] items-start pt-[2px] flex-shrink-0">
          <button
            onClick={onAccept}
            title="Accept this change"
            className="text-xs px-[8px] py-[3px] rounded bg-green-100 text-green-800 hover:bg-green-200 font-medium cursor-pointer"
          >
            ✓
          </button>
          <button
            onClick={onReject}
            title="Reject — revert to original"
            className="text-xs px-[8px] py-[3px] rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium cursor-pointer"
          >
            ✗
          </button>
        </div>
      </div>
    )
  }

  // ── RIGHT PANE — ACCEPTED ─────────────────────────────────────
  // status === 'accepted' OR status === 'original'
  if (status === 'accepted' && current.trim() === '') {
    return null; // Skip rendering completely if a deletion was accepted
  }

  return (
    <div
      className={[
        'flex gap-[8px] mb-[6px] items-start rounded px-[6px] py-[4px]',
        status === 'accepted' ? 'bg-green-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'mt-[6px] w-[5px] h-[5px] rounded-full flex-shrink-0',
          status === 'accepted' ? 'bg-green-500' : 'bg-gray-500',
        ].join(' ')}
      />
      <span className="text-sm leading-relaxed flex-1 text-gray-800">{renderBoldText(current)}</span>
      {status === 'accepted' && (
        <span className="text-xs text-green-600 flex-shrink-0 mt-[2px] font-medium">
          ✓ accepted
        </span>
      )}
    </div>
  )
}