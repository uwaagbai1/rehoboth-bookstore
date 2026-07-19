import { useEffect, useRef } from 'react'

// A USB/Bluetooth barcode scanner types like a very fast keyboard — each
// character of the barcode arrives well under 50ms after the last, then
// Enter. A human typing, even a fast typist, essentially never sustains
// that pace across a whole 8-13 digit code. That timing gap is the entire
// signal used to tell a scan apart from someone typing normally — no
// driver or SDK involved, the scanner is just a keyboard as far as the OS
// is concerned.
const MAX_INTERVAL_MS = 50
const MIN_SCAN_LENGTH = 6

/**
 * Fires `onScan(code)` whenever a fast keystroke burst ending in Enter looks
 * like a real barcode scan. Safe to leave mounted alongside normal text
 * inputs on the same page — slow, human typing (even if it ends in Enter)
 * never accumulates enough characters within the timing window to cross
 * MIN_SCAN_LENGTH, so it never fires for a normal form submission.
 */
export function useScanner(onScan: (code: string) => void, enabled = true): void {
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent): void {
      const now = Date.now()
      const elapsed = now - lastKeyTimeRef.current
      const isFastContinuation = elapsed <= MAX_INTERVAL_MS
      lastKeyTimeRef.current = now

      if (e.key === 'Enter') {
        const code = bufferRef.current
        bufferRef.current = ''
        if (code.length >= MIN_SCAN_LENGTH) {
          // No human sustains sub-50ms keystrokes for a whole barcode, so
          // this is definitely a scan — stop it from also submitting
          // whatever form/input happened to have focus.
          if (isFastContinuation) e.preventDefault()
          onScanRef.current(code)
        }
        return
      }

      // Only accumulate real printable characters — ignore Shift, Tab,
      // Backspace, arrow keys, etc. (all report e.key.length > 1).
      if (e.key.length !== 1) return

      bufferRef.current = isFastContinuation ? bufferRef.current + e.key : e.key

      // A keystroke arriving this fast can only be a scanner — stop it
      // from also being typed into whatever input currently has focus
      // (e.g. the Cash Received box), which would otherwise happen since
      // scanners are indistinguishable from a keyboard at the OS level.
      // The very first character of a burst still gets through (we can't
      // tell it's a scan until the second one arrives quickly after it),
      // so pairing this with auto-focusing the barcode field is what
      // actually closes the gap.
      if (isFastContinuation) e.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled])
}
