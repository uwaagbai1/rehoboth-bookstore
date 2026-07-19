import { useEffect, useMemo, useRef, useState } from 'react'
import type { Book, CompletedSale } from '../../../main/queries'
import { useScanner } from '../hooks/useScanner'
import { useCashier } from '../context/CashierContext'

interface CartLine {
  book: Book
  quantity: number
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} XOF`
}

export function SellPage(): JSX.Element {
  const { cashier } = useCashier()
  const [cart, setCart] = useState<CartLine[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [titleQuery, setTitleQuery] = useState('')
  const [titleResults, setTitleResults] = useState<Book[]>([])
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null)
  const [cashReceived, setCashReceived] = useState<string>('')
  const [discount, setDiscount] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [saving, setSaving] = useState(false)
  const [stockWarning, setStockWarning] = useState<{ book: Book; desiredQty: number } | null>(null)
  const [confirmedOversell, setConfirmedOversell] = useState<Set<number>>(new Set())
  const receiptRef = useRef<HTMLDivElement>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.book.sale_price * line.quantity, 0),
    [cart],
  )
  const discountNumber = Math.min(Number(discount) || 0, subtotal)
  const total = Math.max(subtotal - discountNumber, 0)
  const cashReceivedNumber = Number(cashReceived) || 0
  const changeDue = cashReceivedNumber - total

  // Applies a quantity directly — no stock check. 0 removes the line.
  function applyLineQuantity(book: Book, quantity: number): void {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((line) => line.book.id !== book.id)
      const existing = prev.find((line) => line.book.id === book.id)
      if (existing) return prev.map((line) => (line.book.id === book.id ? { ...line, quantity } : line))
      return [...prev, { book, quantity }]
    })
  }

  // Gate that requires confirmation before a line can exceed what's on hand
  // — the book can still be sold (the store may have uncounted copies), but
  // the till shouldn't silently oversell without someone noticing.
  function setLineQuantity(book: Book, desiredQty: number): void {
    if (desiredQty > 0 && desiredQty > book.quantity && !confirmedOversell.has(book.id)) {
      setStockWarning({ book, desiredQty })
      return
    }
    applyLineQuantity(book, desiredQty)
  }

  function confirmStockWarning(): void {
    if (!stockWarning) return
    setConfirmedOversell((prev) => new Set(prev).add(stockWarning.book.id))
    applyLineQuantity(stockWarning.book, stockWarning.desiredQty)
    setStockWarning(null)
  }

  function cancelStockWarning(): void {
    if (!stockWarning) return
    applyLineQuantity(stockWarning.book, Math.max(0, stockWarning.book.quantity))
    setStockWarning(null)
  }

  function addBookToCart(book: Book): void {
    setError(null)
    setNotFoundBarcode(null)
    const existing = cart.find((line) => line.book.id === book.id)
    setLineQuantity(book, (existing?.quantity ?? 0) + 1)
  }

  async function addByBarcode(barcode: string): Promise<void> {
    setError(null)
    setNotFoundBarcode(null)
    const book = await window.api.books.getByBarcode(barcode.trim())
    if (!book) {
      setNotFoundBarcode(barcode.trim())
      setBarcodeInput('')
      barcodeInputRef.current?.focus()
      return
    }
    addBookToCart(book)
    setBarcodeInput('')
    barcodeInputRef.current?.focus()
  }

  function selectFromSearch(book: Book): void {
    addBookToCart(book)
    setTitleQuery('')
    setTitleResults([])
    barcodeInputRef.current?.focus()
  }

  useScanner((code) => {
    addByBarcode(code)
  }, !completedSale)

  // Refocus the barcode field whenever the sale screen becomes the active
  // one (mount, or a new sale after completing one) — a scan lands in the
  // wrong place if focus was left on the last field the cashier clicked.
  useEffect(() => {
    if (!completedSale) barcodeInputRef.current?.focus()
  }, [completedSale])

  // Books without a barcode can only be found this way — a title search
  // alongside the barcode box, not a replacement for it.
  useEffect(() => {
    if (completedSale || !titleQuery.trim()) {
      setTitleResults([])
      return
    }
    const timeout = setTimeout(() => {
      window.api.books.search(titleQuery).then(setTitleResults)
    }, 200)
    return () => clearTimeout(timeout)
  }, [titleQuery, completedSale])

  // Lets typing continue freely (including a momentary 0 while a digit is
  // being replaced) without dropping the row mid-edit; the stock check and
  // the "clear it to 0 removes it" behavior only apply once editing is done.
  function draftQuantity(bookId: number, quantity: number): void {
    setCart((prev) => prev.map((line) => (line.book.id === bookId ? { ...line, quantity: Math.max(0, quantity) } : line)))
  }

  function commitQuantity(line: CartLine): void {
    if (line.quantity <= 0) {
      applyLineQuantity(line.book, 0)
      return
    }
    setLineQuantity(line.book, line.quantity)
  }

  function removeLine(bookId: number): void {
    setCart((prev) => prev.filter((line) => line.book.id !== bookId))
    setConfirmedOversell((prev) => {
      if (!prev.has(bookId)) return prev
      const next = new Set(prev)
      next.delete(bookId)
      return next
    })
  }

  async function completeSale(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const sale = await window.api.sales.complete(
        cart.map((line) => ({ bookId: line.book.id, quantity: line.quantity })),
        cashReceivedNumber,
        discountNumber,
        cashier.id,
        cashier.name,
      )
      setCompletedSale(sale)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this sale.')
    } finally {
      setSaving(false)
    }
  }

  function startNewSale(): void {
    setCart([])
    setBarcodeInput('')
    setCashReceived('')
    setDiscount('')
    setCompletedSale(null)
    setError(null)
    setConfirmedOversell(new Set())
  }

  async function printReceipt(): Promise<void> {
    const result = await window.api.system.printReceipt()
    if (!result.success) {
      setError(result.error ? `Could not print: ${result.error}` : 'Could not print the receipt.')
    }
  }

  if (completedSale) {
    return (
      <div>
        <h2 className="page-title">Sale Complete</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="card receipt" ref={receiptRef} style={{ maxWidth: 380, marginBottom: 20 }}>
          <h3 style={{ textAlign: 'center', marginTop: 0 }}>Rehoboth Bookstore</h3>
          <p style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 12, marginTop: -8 }}>
            Receipt #{completedSale.id} · {new Date(completedSale.created_at).toLocaleString()}
          </p>
          <hr style={{ border: 'none', borderTop: '1px dashed var(--border)' }} />
          {completedSale.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
              <span>{item.quantity}&times; {item.book_title}</span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
          <hr style={{ border: 'none', borderTop: '1px dashed var(--border)' }} />
          {completedSale.discount_amount > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>Subtotal</span>
                <span>{formatCurrency(completedSale.total_amount + completedSale.discount_amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--red-600)' }}>
                <span>Discount</span><span>-{formatCurrency(completedSale.discount_amount)}</span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
            <span>Total</span><span>{formatCurrency(completedSale.total_amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--ink-muted)' }}>
            <span>Cash Received</span><span>{formatCurrency(completedSale.cash_received)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--ink-muted)' }}>
            <span>Change Given</span><span>{formatCurrency(completedSale.change_given)}</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed var(--border)' }} />
          <p style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 11, margin: 0 }}>
            Served by {completedSale.cashier_name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={printReceipt}>Print Receipt</button>
          <button className="btn btn-gold" onClick={startNewSale}>Start New Sale</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="page-title">Sell</h2>
      <p className="page-subtitle">Scan books, or search by title, to add them to the sale.</p>

      <div className="scanner-hint">Scan a book, or type its barcode below — or search by title if it has no barcode.</div>

      {error && <div className="error-banner">{error}</div>}
      {notFoundBarcode && (
        <div className="error-banner">
          No book found for barcode "{notFoundBarcode}" — check Receive Stock if this is a new title.
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field">
          <label>Barcode</label>
          <input
            ref={barcodeInputRef}
            autoFocus
            placeholder="Scan or type a barcode…"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addByBarcode(barcodeInput)
            }}
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
                  onClick={() => selectFromSearch(book)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                    padding: '10px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 14,
                  }}
                >
                  <span>{book.title}</span>
                  <span style={{ color: 'var(--ink-muted)' }}>{formatCurrency(book.sale_price)} · {book.quantity} in stock</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr><th>Book</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th><th /></tr>
          </thead>
          <tbody>
            {cart.map((line) => (
              <tr key={line.book.id}>
                <td>{line.book.title}</td>
                <td>
                  <input
                    type="number" min={0} value={line.quantity} style={{ width: 64 }}
                    onChange={(e) => draftQuantity(line.book.id, Number(e.target.value))}
                    onBlur={() => commitQuantity(line)}
                  />
                </td>
                <td>{formatCurrency(line.book.sale_price)}</td>
                <td>{formatCurrency(line.book.sale_price * line.quantity)}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => removeLine(line.book.id)}>Remove</button>
                </td>
              </tr>
            ))}
            {cart.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: 24 }}>
                Cart is empty — scan a book to begin.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--ink-muted)', marginBottom: 8 }}>
          <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="field">
          <label>Discount (XOF)</label>
          <input
            type="number" min={0} max={subtotal} value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
          <span>Total Due</span><span>{formatCurrency(total)}</span>
        </div>
        <div className="field">
          <label>Cash Received (XOF)</label>
          <input
            type="number" min={0} value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginBottom: 16 }}>
          <span>Change Due</span>
          <span style={{ color: changeDue < 0 ? 'var(--red-600)' : 'var(--green-600)', fontWeight: 700 }}>
            {formatCurrency(Math.max(changeDue, 0))}
          </span>
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={cart.length === 0 || changeDue < 0 || saving}
          onClick={completeSale}
        >
          {saving ? 'Completing…' : 'Complete Sale'}
        </button>
      </div>

      {stockWarning && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3 style={{ marginTop: 0 }}>
              {stockWarning.book.quantity > 0 ? 'Low Stock' : 'Book Finished'}
            </h3>
            <p style={{ color: 'var(--ink-muted)' }}>
              {stockWarning.book.quantity > 0
                ? `Only ${stockWarning.book.quantity} of "${stockWarning.book.title}" left, but you're selling ${stockWarning.desiredQty}.`
                : `"${stockWarning.book.title}" is finished in the system (0 in stock).`}
              {' '}Add it anyway? It'll show as negative stock until more copies are received.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-gold" onClick={confirmStockWarning}>Add Anyway</button>
              <button className="btn btn-ghost" onClick={cancelStockWarning}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
