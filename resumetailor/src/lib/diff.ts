// src/lib/diff.ts

import { diff_match_patch, DIFF_INSERT, DIFF_DELETE, DIFF_EQUAL } from 'diff-match-patch'

const dmp = new diff_match_patch()

export interface DiffSpan {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

/**
 * Computes a word-level diff between two strings.
 * Returns an array of spans — each is 'equal', 'insert', or 'delete'.
 * 
 * Usage:
 *   const spans = wordDiff("Built tools using React", "Engineered scalable tools with React and TypeScript")
 *   → [{ type: 'delete', text: 'Built' }, { type: 'insert', text: 'Engineered scalable' }, ...]
 */
export function wordDiff(oldText: string, newText: string): DiffSpan[] {
  // diff-match-patch is char-level by default.
  // We trick it into word-level by replacing spaces with newlines,
  // running the char diff, then restoring.
  const oldWords = oldText.trim().split(/\s+/).join('\n')
  const newWords = newText.trim().split(/\s+/).join('\n')

  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(oldWords, newWords)
  const diffs = dmp.diff_main(chars1, chars2, false)
  dmp.diff_charsToLines_(diffs, lineArray)
  dmp.diff_cleanupSemantic(diffs)

  return diffs
    .map(([op, text]) => ({
      type: op === DIFF_INSERT ? 'insert'
          : op === DIFF_DELETE ? 'delete'
          : 'equal',
      text: text.replace(/\n/g, ' ').trim(),
    } as DiffSpan))
    .filter(span => span.text.length > 0)
}