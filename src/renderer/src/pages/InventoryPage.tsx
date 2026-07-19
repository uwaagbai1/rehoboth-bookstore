import { useEffect, useRef, useState } from 'react'
import type { Book, NewBookInput, PriceChange } from '../../../main/queries'
import { useScanner } from '../hooks/useScanner'
import { BOOK_CATEGORIES } from '../constants'

const EMPTY_FORM: NewBookInput = {
  barcode: null,
  title: '',
  category: '',
  cost_price: 0,
  sale_price: 0,
  quantity: 0,
  low_stock_threshold: 3,
}

export function InventoryPage(): JSX.Element {
  const [books, setBooks] = useState<Book[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Book | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewBookInput>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [historyBook, setHistoryBook] = useState<Book | null>(null)
  const [priceHistory, setPriceHistory] = useState<PriceChange[]>([])
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  async function load(searchQuery: string): Promise<void> {
    const results = searchQuery.trim() ? await window.api.books.search(searchQuery) : await window.api.books.getAll()
    setBooks(results)
  }

  useEffect(() => {
    load(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => load(query), 200)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Only listens while the Add/Edit form is actually open, so scanning
  // elsewhere in the app (or scanning while just browsing this page)
  // doesn't unexpectedly drop a barcode into a closed form.
  useScanner((code) => {
    setForm((f) => ({ ...f, barcode: code }))
  }, showForm)

  // The form's own autoFocus only fires on first mount of the field, not
  // every time it reopens — without this, scanning right after clicking
  // "+ Add Book" a second time could land wherever focus was last left.
  useEffect(() => {
    if (showForm) barcodeInputRef.current?.focus()
  }, [showForm])

  function openNewForm(): void {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEditForm(book: Book): void {
    setEditing(book)
    setForm(book)
    setError(null)
    setShowForm(true)
  }

  async function openPriceHistory(book: Book): Promise<void> {
    setHistoryBook(book)
    setPriceHistory(await window.api.books.priceHistory(book.id))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await window.api.books.update(editing.id, form)
      } else {
        await window.api.books.create(form)
      }
      setShowForm(false)
      await load(query)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this book.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="page-title">Inventory</h2>
      <p className="page-subtitle">{books.length} title{books.length === 1 ? '' : 's'} in stock.</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          placeholder="Search by title or barcode…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={openNewForm}>+ Add Book</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form onSubmit={handleSubmit}>
            {error && <div className="error-banner">{error}</div>}
            <div className="scanner-hint">Scan the book now to fill in its barcode — or leave it blank if it doesn't have one; the title will identify it instead.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label>Barcode (optional — scan to fill)</label>
                <input
                  ref={barcodeInputRef}
                  value={form.barcode ?? ''}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value || null })}
                  placeholder="No barcode"
                />
              </div>
              <div className="field">
                <label>Title</label>
                <input
                  required value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select a category…</option>
                  {BOOK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Sale Price (XOF)</label>
                <input
                  type="number" min={0} value={form.sale_price}
                  onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Quantity in Stock</label>
                <input
                  type="number" min={0} value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Low Stock Alert Threshold</label>
                <input
                  type="number" min={0} value={form.low_stock_threshold}
                  onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Book'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Barcode</th>
              <th>Stock</th>
              <th>Cost</th>
              <th>Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id} className={book.quantity <= book.low_stock_threshold ? 'low-stock' : ''}>
                <td>{book.title}</td>
                <td>{book.category}</td>
                <td>{book.barcode ?? <span style={{ color: 'var(--ink-muted)' }}>—</span>}</td>
                <td>
                  {book.quantity}
                  {book.quantity <= book.low_stock_threshold && (
                    <span className="badge badge-low" style={{ marginLeft: 8 }}>Low</span>
                  )}
                </td>
                <td>{book.cost_price.toLocaleString()}</td>
                <td>{book.sale_price.toLocaleString()}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => openEditForm(book)}>Edit</button>
                  <button className="btn btn-ghost" onClick={() => openPriceHistory(book)}>History</button>
                </td>
              </tr>
            ))}
            {books.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: 24 }}>
                No books found.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {historyBook && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3 style={{ marginTop: 0 }}>Price History — {historyBook.title}</h3>
            <p style={{ color: 'var(--ink-muted)', marginTop: -8, fontSize: 13 }}>
              Current price: {historyBook.sale_price.toLocaleString()} XOF
            </p>
            {priceHistory.length === 0 ? (
              <p style={{ color: 'var(--ink-muted)' }}>No price changes recorded yet.</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {priceHistory.map((change) => (
                  <div
                    key={change.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', fontSize: 14,
                      padding: '8px 0', borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span>{new Date(change.changed_at).toLocaleString()}</span>
                    <span>
                      {change.old_sale_price.toLocaleString()} → <strong>{change.new_sale_price.toLocaleString()}</strong> XOF
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setHistoryBook(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
