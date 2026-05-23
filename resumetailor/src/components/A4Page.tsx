// src/components/A4Page.tsx

interface A4PageProps {
  children: React.ReactNode
  locked?:  boolean   // true = left pane (original, read-only)
}

/**
 * Renders a white A4-sized card that looks like a PDF page.
 * Both left and right panes use this — left pane gets locked=true.
 * 
 * Width:  794px  = A4 at 96dpi
 * Height: 1123px = A4 at 96dpi (min-height, grows with content)
 */
export function A4Page({ children, locked = false }: A4PageProps) {
  return (
    <div
      className={[
        'bg-white shadow-lg mx-auto',
        'w-full max-w-[850px]',
        'px-[48px] py-[40px] sm:px-[64px] sm:py-[54px]', 
        'font-[EB_Garamond] text-[15px] sm:text-[16px] leading-relaxed text-gray-800',
        locked ? 'opacity-75 pointer-events-none select-none' : '', 
      ].join(' ')}
    >
      {children}
    </div>
  )
}

/** Section title — EXPERIENCE, SKILLS, EDUCATION */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] sm:text-[14px] font-bold uppercase tracking-[0.12em] text-gray-900 border-b border-gray-300 pb-[3px] mt-[20px] mb-[8px]">
      {children}
    </h2>
  )
}