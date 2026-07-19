import { useEffect, useState } from 'react'
import type { CompletedSale, RevenueSummary, StockReceiptRecord, ReturnRecord, ReorderItem } from '../../../main/queries'
import { useCashier } from '../context/CashierContext'

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} XOF`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function ReportsPage(): JSX.Element {
  const { cashier } = useCashier()
  const [sales, setSales] = useState<CompletedSale[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [expandedReturns, setExpandedReturns] = useState<ReturnRecord[]>([])
  const [returnQty, setReturnQty] = useState<Record<number, string>>({})
  const [returnError, setReturnError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState(daysAgoIso(7))
  const [toDate, setToDate] = useState(todayIso())
  const [summary, setSummary] = useState<RevenueSummary | null>(null)
  const [receipts, setReceipts] = useState<StockReceiptRecord[]>([])
  const [reorderList, setReorderList] = useState<ReorderItem[]>([])

  function loadSales(): void {
    window.api.sales.history(200).then(setSales)
  }

  useEffect(() => {
    loadSales()
    window.api.stock.history(200).then(setReceipts)
    window.api.reports.reorderList().then(setReorderList)
  }, [])

  function loadSummary(): void {
    window.api.reports.revenue(fromDate, toDate).then(setSummary)
  }

  useEffect(() => {
    loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate])

  async function toggleExpand(sale: CompletedSale): Promise<void> {
    setReturnError(null)
    if (expandedId === sale.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(sale.id)
    setExpandedReturns(await window.api.sales.returnsForSale(sale.id))
  }

  async function submitReturn(sale: CompletedSale, item: CompletedSale['items'][number]): Promise<void> {
    setReturnError(null)
    const qty = Number(returnQty[item.book_id])
    if (!qty || qty <= 0) return
    try {
      await window.api.sales.processReturn(sale.id, item.book_id, qty, '', cashier.id, cashier.name)
      setExpandedReturns(await window.api.sales.returnsForSale(sale.id))
      setReturnQty((prev) => ({ ...prev, [item.book_id]: '' }))
      loadSales()
      loadSummary()
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : 'Could not process that return.')
    }
  }

  return (
    <div>
      <h2 className="page-title">Reports</h2>
      <p className="page-subtitle">Revenue, profit, and sales history.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 20 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        {summary && (
          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <div className="stat-label">Revenue</div>
              <div className="stat-value">{formatCurrency(summary.revenue)}</div>
            </div>
            {summary.returnsAmount > 0 && (
              <div className="stat-card">
                <div className="stat-label">Returns</div>
                <div className="stat-value" style={{ color: 'var(--red-600)' }}>-{formatCurrency(summary.returnsAmount)}</div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-label">Cost of Goods Sold</div>
              <div className="stat-value">{formatCurrency(summary.costOfGoodsSold)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Profit</div>
              <div className="stat-value">{formatCurrency(summary.profit)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sales</div>
              <div className="stat-value">{summary.saleCount}</div>
            </div>
          </div>
        )}
      </div>

      {reorderList.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Reorder List</h3>
          <p style={{ color: 'var(--ink-muted)', marginTop: -8, fontSize: 13 }}>
            Titles at or below their low-stock alert level.
          </p>
          <table>
            <thead>
              <tr><th>Title</th><th>Category</th><th>In Stock</th><th>Suggested Reorder</th></tr>
            </thead>
            <tbody>
              {reorderList.map((item) => (
                <tr key={item.id} className="low-stock">
                  <td>{item.title}</td>
                  <td>{item.category}</td>
                  <td>{item.quantity}</td>
                  <td>+{item.suggestedReorder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sales History</h3>
        {returnError && <div className="error-banner">{returnError}</div>}
        <table>
          <thead>
            <tr><th>Date</th><th>Receipt #</th><th>Cashier</th><th>Items</th><th>Total</th></tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <>
                <tr
                  key={sale.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleExpand(sale)}
                >
                  <td>{new Date(sale.created_at).toLocaleString()}</td>
                  <td>#{sale.id}</td>
                  <td>{sale.cashier_name || <span style={{ color: 'var(--ink-muted)' }}>—</span>}</td>
                  <td>{sale.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                  <td>{formatCurrency(sale.total_amount)}</td>
                </tr>
                {expandedId === sale.id && (
                  <tr key={`${sale.id}-detail`}>
                    <td colSpan={5} style={{ background: 'var(--gold-100)' }}>
                      {sale.items.map((item, i) => {
                        const alreadyReturned = expandedReturns
                          .filter((r) => r.book_id === item.book_id)
                          .reduce((sum, r) => sum + r.quantity, 0)
                        const remaining = item.quantity - alreadyReturned
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                            <span>{item.quantity}&times; {item.book_title}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {formatCurrency(item.subtotal)}
                              {remaining > 0 ? (
                                <>
                                  <input
                                    type="number" min={1} max={remaining}
                                    placeholder="Qty"
                                    value={returnQty[item.book_id] ?? ''}
                                    onChange={(e) => setReturnQty((prev) => ({ ...prev, [item.book_id]: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ width: 56 }}
                                  />
                                  <button
                                    className="btn btn-ghost"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      submitReturn(sale, item)
                                    }}
                                  >
                                    Return
                                  </button>
                                </>
                              ) : (
                                <span className="badge badge-low">Fully Returned</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                      {expandedReturns.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                          {expandedReturns.map((r) => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-muted)', padding: '2px 0' }}>
                              <span>Returned {r.quantity}&times; {r.book_title} — {r.cashier_name}</span>
                              <span>-{formatCurrency(r.refund_amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {sales.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: 24 }}>
                No sales recorded yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Stock Received</h3>
        <table>
          <thead>
            <tr><th>Date</th><th>Book</th><th>Qty Added</th><th>Cost Price</th><th>By</th><th>Note</th></tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.book_title}</td>
                <td>+{r.quantity_added}</td>
                <td>{formatCurrency(r.cost_price_at_receipt)}</td>
                <td>{r.cashier_name || <span style={{ color: 'var(--ink-muted)' }}>—</span>}</td>
                <td>{r.note || <span style={{ color: 'var(--ink-muted)' }}>—</span>}</td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: 24 }}>
                No stock received yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
