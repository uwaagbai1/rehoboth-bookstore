import { useEffect, useRef, useState } from 'react'
import type { Book, NewBookInput } from '../../../main/queries'
import { useScanner } from '../hooks/useScanner'
import { BOOK_CATEGORIES } from '../constants'
import { useCashier } from '../context/CashierContext'

type Mode = 'idle' | 'restock' | 'new'

export function ReceiveStockPage(): JSX.Element {
  const { cashier } = useCashier()
  const [mode, setMode] = useState<Mode>('idle')
  const [barcodeInput, setBarcodeInput] = useState('')
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const quantityInputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [titleQuery, setTitleQuery] = useState('')
  const [titleResults, setTitleResults] = useState<Book[]>([])
  const [existingBook, setExistingBook] = useState<Book | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Restock form
  const [quantityAdded, setQuantityAdded] = useState(1)
  const [costPrice, setCostPrice] = useState(0)
  const [note, setNote] = useState('')

  // New-book form
  const [newBook, setNewBook] = useState<NewBookInput>({
    barcode: null, title: '', category: '', cost_price: 0, sale_price: 0, quantity: 0, low_stock_threshold: 3,
  })

  function selectForRestock(book: Book): void {
    setExistingBook(book)
    setCostPrice(book.cost_price)
    setQuantityAdded(1)
    setNote('')
    setMode('restock')
  }

  async function lookup(code: string): Promise<void> {
    setError(null)
    setSuccess(null)
    const trimmed = code.trim()
    if (!trimmed) return
    const book = await window.api.books.getByBarcode(trimmed)
    if (book) {
      selectForRestock(book)
    } else {
      setNewBook((b) => ({ ...b, barcode: trimmed }))
      setExistingBook(null)
      setMode('new')
    }
  }

  useScanner((code) => {
    lookup(code)
  }, mode === 'idle')

  // Move focus to wherever's needed next as the screen changes mode — a
  // scan while focus was left on some other field would otherwise land in
  // the wrong place, and staff shouldn't need to click before typing.
  useEffect(() => {
    if (mode === 'idle') barcodeInputRef.current?.focus()
    if (mode === 'restock') quantityInputRef.current?.focus()
    if (mode === 'new') titleInputRef.current?.focus()
  }, [mode])

  // Books without a barcode can only be found this way — a title search
  // alongside the barcode box, not a replacement for it.
  useEffect(() => {
    if (mode !== 'idle' || !titleQuery.trim()) {
      setTitleResults([])
      return
    }
    const timeout = setTimeout(() => {
      window.api.books.search(titleQuery).then(setTitleResults)
    }, 200)
    return () => clearTimeout(timeout)
  }, [titleQuery, mode])

  function reset(): void {
    setMode('idle')
    setBarcodeInput('')
    setTitleQuery('')
    setTitleResults([])
    setExistingBook(null)
    setError(null)
  }

  async function handleRestock(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!existingBook) return
    setSaving(true)
    setError(null)
    try {
      await window.api.stock.receive(existingBook.id, quantityAdded, costPrice, note, cashier.id, cashier.name)
      setSuccess(`Added ${quantityAdded} cop${quantityAdded === 1 ? 'y' : 'ies'} of "${existingBook.title}".`)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not receive stock.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateNew(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Created with 0 stock first, then receiveStock brings it up to the
      // requested quantity — that's what puts an initial-stock entry in the
      // Stock Received history, same as any other restock.
      const created = await window.api.books.create({ ...newBook, quantity: 0 })
      if (newBook.quantity > 0) {
        await window.api.stock.receive(
          created.id, newBook.quantity, newBook.cost_price, 'Initial stock', cashier.id, cashier.name,
        )
      }
      setSuccess(`Added new title "${created.title}" with ${newBook.quantity} in stock.`)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this book — check the barcode is unique.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="page-title">Receive Stock</h2>
      <p className="page-subtitle">Scan a book to add stock, or create a new title.</p>

      {mode === 'idle' && (
        <div className="scanner-hint">Scan a book, or type its barcode below — if it has no barcode, search by title instead.</div>
      )}

      {success && <div className="card" style={{ marginBottom: 20, color: 'var(--green-600)', fontWeight: 600 }}>{success}</div>}
      {error && <div className="error-banner">{error}</div>}

      {mode === 'idle' && (
        <div className="card">
          <div className="field">
            <label>Barcode</label>
            <input
              ref={barcodeInputRef}
              autoFocus
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') lookup(barcodeInput)
              }}
              placeholder="Scan or type a barcode…"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Or search by title (no barcode)</label>
            <input
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              placeholder="Start typing a title…"
            />
            {titleResults.length > 0 && (
              <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {titleResults.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => selectForRestock(book)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                      padding: '10px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 14,
                    }}
                  >
                    <span>{book.title}</span>
                    <span style={{ color: 'var(--ink-muted)' }}>{book.quantity} in stock</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'restock' && existingBook && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{existingBook.title}</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: 0 }}>
            {existingBook.category} · Currently {existingBook.quantity} in stock
          </p>
          <form onSubmit={handleRestock}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label>Quantity Received</label>
                <input
                  ref={quantityInputRef}
                  type="number" min={1} required value={quantityAdded}
                  onChange={(e) => setQuantityAdded(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Cost Price (XOF, this batch)</label>
                <input
                  type="number" min={0} value={costPrice}
                  onChange={(e) => setCostPrice(Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. supplier name" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-gold" disabled={saving}>
                {saving ? 'Saving…' : 'Add to Stock'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {mode === 'new' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New Title</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: 0 }}>
            Barcode <strong>{newBook.barcode}</strong> isn't in the system yet — add its details.
          </p>
          <form onSubmit={handleCreateNew}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label>Title</label>
                <input
                  ref={titleInputRef}
                  required value={newBook.title}
                  onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={newBook.category} onChange={(e) => setNewBook({ ...newBook, category: e.target.value })}>
                  <option value="">Select a category…</option>
                  {BOOK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Quantity Received</label>
                <input
                  type="number" min={0} value={newBook.quantity}
                  onChange={(e) => setNewBook({ ...newBook, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Cost Price (XOF)</label>
                <input
                  type="number" min={0} value={newBook.cost_price}
                  onChange={(e) => setNewBook({ ...newBook, cost_price: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Sale Price (XOF)</label>
                <input
                  type="number" min={0} value={newBook.sale_price}
                  onChange={(e) => setNewBook({ ...newBook, sale_price: Number(e.target.value) })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-gold" disabled={saving}>
                {saving ? 'Saving…' : 'Add New Title'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
