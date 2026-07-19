import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { db } from './db'

export interface Book {
  id: number
  barcode: string | null
  title: string
  category: string
  cost_price: number
  sale_price: number
  quantity: number
  low_stock_threshold: number
  created_at: string
  updated_at: string
}

export interface NewBookInput {
  barcode: string | null
  title: string
  category: string
  cost_price: number
  sale_price: number
  quantity: number
  low_stock_threshold?: number
}

export function getAllBooks(): Book[] {
  return db.prepare('SELECT * FROM books ORDER BY title ASC').all() as Book[]
}

export function searchBooks(query: string): Book[] {
  const like = `%${query}%`
  return db
    .prepare(`SELECT * FROM books WHERE title LIKE ? OR barcode LIKE ? ORDER BY title ASC`)
    .all(like, like) as Book[]
}

export function getBookByBarcode(barcode: string): Book | undefined {
  return db.prepare('SELECT * FROM books WHERE barcode = ?').get(barcode) as Book | undefined
}

export function getBookById(id: number): Book | undefined {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id) as Book | undefined
}

export function createBook(input: NewBookInput): Book {
  const result = db
    .prepare(
      `INSERT INTO books (barcode, title, category, cost_price, sale_price, quantity, low_stock_threshold)
       VALUES (@barcode, @title, @category, @cost_price, @sale_price, @quantity, @low_stock_threshold)`,
    )
    .run({ low_stock_threshold: 3, ...input, barcode: input.barcode || null })
  return getBookById(Number(result.lastInsertRowid))!
}

export function updateBook(id: number, input: Partial<NewBookInput>): Book {
  const existing = getBookById(id)
  if (!existing) throw new Error('Book not found')
  const merged = { ...existing, ...input }

  const tx = db.transaction(() => {
    if (input.sale_price !== undefined && input.sale_price !== existing.sale_price) {
      db.prepare(
        `INSERT INTO price_history (book_id, old_sale_price, new_sale_price) VALUES (?, ?, ?)`,
      ).run(id, existing.sale_price, input.sale_price)
    }
    db.prepare(
      `UPDATE books SET barcode=@barcode, title=@title, category=@category,
       cost_price=@cost_price, sale_price=@sale_price, quantity=@quantity,
       low_stock_threshold=@low_stock_threshold, updated_at=datetime('now') WHERE id=@id`,
    ).run({ ...merged, id })
  })
  tx()
  return getBookById(id)!
}

export interface StockReceiptRecord {
  id: number
  book_id: number
  book_title: string
  quantity_added: number
  cost_price_at_receipt: number
  note: string
  cashier_name: string
  created_at: string
}

export function getStockReceiptHistory(limit = 200): StockReceiptRecord[] {
  return db
    .prepare(
      `SELECT sr.id, sr.book_id, b.title as book_title, sr.quantity_added,
              sr.cost_price_at_receipt, sr.note, sr.cashier_name, sr.created_at
       FROM stock_receipts sr
       JOIN books b ON b.id = sr.book_id
       ORDER BY sr.created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StockReceiptRecord[]
}

export interface PriceChange {
  id: number
  old_sale_price: number
  new_sale_price: number
  changed_at: string
}

export function getPriceHistory(bookId: number): PriceChange[] {
  return db
    .prepare(
      `SELECT id, old_sale_price, new_sale_price, changed_at FROM price_history
       WHERE book_id = ? ORDER BY changed_at DESC`,
    )
    .all(bookId) as PriceChange[]
}

export function receiveStock(
  bookId: number,
  quantityAdded: number,
  costPriceAtReceipt: number,
  note: string,
  cashierId: number | null = null,
  cashierName = '',
): Book {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO stock_receipts (book_id, quantity_added, cost_price_at_receipt, note, cashier_id, cashier_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(bookId, quantityAdded, costPriceAtReceipt, note, cashierId, cashierName)
    db.prepare(
      `UPDATE books SET quantity = quantity + ?, cost_price = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(quantityAdded, costPriceAtReceipt, bookId)
  })
  tx()
  return getBookById(bookId)!
}

// Kept intentionally simple for a one-till shop: a name plus a 4-digit PIN,
// no roles or sessions — this is for accountability (who rang up a sale or
// processed a return), not access control, so the hashing just needs to
// avoid storing PINs in plain text, not resist a determined attacker.
export interface Cashier {
  id: number
  name: string
  created_at: string
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString('hex')
}

export function createCashier(name: string, pin: string): Cashier {
  const salt = randomBytes(16).toString('hex')
  const pinHash = hashPin(pin, salt)
  const result = db
    .prepare(`INSERT INTO cashiers (name, pin_hash, pin_salt) VALUES (?, ?, ?)`)
    .run(name, pinHash, salt)
  return getCashierById(Number(result.lastInsertRowid))!
}

export function getCashierById(id: number): Cashier | undefined {
  return db.prepare(`SELECT id, name, created_at FROM cashiers WHERE id = ?`).get(id) as Cashier | undefined
}

export function getAllCashiers(): Cashier[] {
  return db.prepare(`SELECT id, name, created_at FROM cashiers ORDER BY name ASC`).all() as Cashier[]
}

export function deleteCashier(id: number): void {
  db.prepare(`DELETE FROM cashiers WHERE id = ?`).run(id)
}

export function verifyCashierPin(cashierId: number, pin: string): Cashier | null {
  const row = db.prepare(`SELECT id, name, pin_hash, pin_salt FROM cashiers WHERE id = ?`).get(cashierId) as
    | { id: number; name: string; pin_hash: string; pin_salt: string }
    | undefined
  if (!row) return null
  const candidate = Buffer.from(hashPin(pin, row.pin_salt), 'hex')
  const stored = Buffer.from(row.pin_hash, 'hex')
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return null
  return { id: row.id, name: row.name, created_at: '' }
}

export interface CartLine {
  bookId: number
  quantity: number
}

export interface CompletedSale {
  id: number
  created_at: string
  total_amount: number
  discount_amount: number
  cash_received: number
  change_given: number
  cashier_name: string
  items: { book_id: number; book_title: string; quantity: number; unit_price: number; subtotal: number }[]
}

/** Runs as one transaction: any failure (missing book, insufficient cash)
 * rolls back the whole sale rather than partially selling some books and
 * not others. Selling more than is on hand is allowed on purpose — the
 * renderer warns the cashier first, but doesn't block the sale, since the
 * store may have uncounted copies on the shelf. This can push a book's
 * quantity negative; receiving stock later (receiveStock) adds on top of
 * that negative baseline, so the count self-corrects to the true total
 * rather than needing a manual reconciliation step.
 *
 * discountAmount is applied to the subtotal before the cash-sufficiency
 * check, so "cash received" only ever needs to cover the discounted total. */
export function completeSale(
  lines: CartLine[],
  cashReceived: number,
  discountAmount = 0,
  cashierId: number | null = null,
  cashierName = '',
): CompletedSale {
  if (lines.length === 0) throw new Error('Cannot complete a sale with no items.')

  const tx = db.transaction(() => {
    const resolvedItems = lines.map((line) => {
      const book = getBookById(line.bookId)
      if (!book) throw new Error(`Book #${line.bookId} not found.`)
      return {
        book,
        quantity: line.quantity,
        unit_price: book.sale_price,
        subtotal: book.sale_price * line.quantity,
      }
    })

    const subtotal = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const totalAmount = Math.max(subtotal - discountAmount, 0)
    if (cashReceived < totalAmount) {
      throw new Error('Cash received is less than the total due.')
    }
    const changeGiven = cashReceived - totalAmount

    const saleResult = db
      .prepare(
        `INSERT INTO sales (total_amount, discount_amount, cash_received, change_given, cashier_id, cashier_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(totalAmount, discountAmount, cashReceived, changeGiven, cashierId, cashierName)
    const saleId = Number(saleResult.lastInsertRowid)

    const insertItem = db.prepare(
      `INSERT INTO sale_items (sale_id, book_id, book_title, quantity, unit_price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const decrementStock = db.prepare(
      `UPDATE books SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?`,
    )
    for (const item of resolvedItems) {
      insertItem.run(saleId, item.book.id, item.book.title, item.quantity, item.unit_price, item.subtotal)
      decrementStock.run(item.quantity, item.book.id)
    }

    return {
      id: saleId,
      created_at: new Date().toISOString(),
      total_amount: totalAmount,
      discount_amount: discountAmount,
      cash_received: cashReceived,
      change_given: changeGiven,
      cashier_name: cashierName,
      items: resolvedItems.map((i) => ({
        book_id: i.book.id,
        book_title: i.book.title,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
      })),
    }
  })

  return tx()
}

export function getSalesHistory(limit = 100): CompletedSale[] {
  const sales = db
    .prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Omit<CompletedSale, 'items'>[]
  const itemsStmt = db.prepare(
    'SELECT book_id, book_title, quantity, unit_price, subtotal FROM sale_items WHERE sale_id = ?',
  )
  return sales.map((sale) => ({
    ...sale,
    items: itemsStmt.all(sale.id) as CompletedSale['items'],
  }))
}

export interface ReturnRecord {
  id: number
  sale_id: number
  book_id: number
  book_title: string
  quantity: number
  refund_amount: number
  note: string
  cashier_name: string
  created_at: string
}

/** A return never edits sale_items (the original sale stays the honest
 * historical record) — it's a separate ledger entry, netted against
 * revenue in reports, that also puts the returned copies back in stock. */
export function processReturn(
  saleId: number,
  bookId: number,
  quantity: number,
  note: string,
  cashierId: number | null = null,
  cashierName = '',
): ReturnRecord {
  if (quantity <= 0) throw new Error('Return quantity must be greater than zero.')

  const tx = db.transaction(() => {
    const item = db
      .prepare(`SELECT book_title, quantity, unit_price FROM sale_items WHERE sale_id = ? AND book_id = ?`)
      .get(saleId, bookId) as { book_title: string; quantity: number; unit_price: number } | undefined
    if (!item) throw new Error('That book was not part of this sale.')

    const alreadyReturned = (
      db.prepare(`SELECT COALESCE(SUM(quantity), 0) as qty FROM returns WHERE sale_id = ? AND book_id = ?`)
        .get(saleId, bookId) as { qty: number }
    ).qty
    const remaining = item.quantity - alreadyReturned
    if (quantity > remaining) {
      throw new Error(`Only ${remaining} of "${item.book_title}" from this sale can still be returned.`)
    }

    // A sale's discount is applied to the whole sale, not per line, so a
    // return needs to refund the same discounted rate the customer
    // actually paid per unit — not the pre-discount unit_price, which
    // would over-refund whenever the original sale had a discount on it.
    const sale = db.prepare(`SELECT total_amount FROM sales WHERE id = ?`).get(saleId) as
      | { total_amount: number }
      | undefined
    if (!sale) throw new Error('Sale not found.')
    const saleSubtotal = (
      db.prepare(`SELECT COALESCE(SUM(subtotal), 0) as s FROM sale_items WHERE sale_id = ?`).get(saleId) as {
        s: number
      }
    ).s
    const discountRatio = saleSubtotal > 0 ? sale.total_amount / saleSubtotal : 1
    const refundAmount = item.unit_price * quantity * discountRatio
    const result = db
      .prepare(
        `INSERT INTO returns (sale_id, book_id, book_title, quantity, refund_amount, note, cashier_id, cashier_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(saleId, bookId, item.book_title, quantity, refundAmount, note, cashierId, cashierName)
    db.prepare(`UPDATE books SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`).run(
      quantity,
      bookId,
    )

    return {
      id: Number(result.lastInsertRowid),
      sale_id: saleId,
      book_id: bookId,
      book_title: item.book_title,
      quantity,
      refund_amount: refundAmount,
      note,
      cashier_name: cashierName,
      created_at: new Date().toISOString(),
    }
  })

  return tx()
}

export function getReturnsForSale(saleId: number): ReturnRecord[] {
  return db
    .prepare(
      `SELECT id, sale_id, book_id, book_title, quantity, refund_amount, note, cashier_name, created_at
       FROM returns WHERE sale_id = ? ORDER BY created_at ASC`,
    )
    .all(saleId) as ReturnRecord[]
}

export interface DashboardStats {
  todaySalesTotal: number
  todaySalesCount: number
  inventoryValue: number
  lowStockCount: number
}

export function getDashboardStats(): DashboardStats {
  const today = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
       FROM sales WHERE date(created_at) = date('now')`,
    )
    .get() as { total: number; count: number }
  const inventory = db
    .prepare('SELECT COALESCE(SUM(quantity * cost_price), 0) as value FROM books')
    .get() as { value: number }
  const lowStock = db
    .prepare('SELECT COUNT(*) as count FROM books WHERE quantity <= low_stock_threshold')
    .get() as { count: number }

  return {
    todaySalesTotal: today.total,
    todaySalesCount: today.count,
    inventoryValue: inventory.value,
    lowStockCount: lowStock.count,
  }
}

export interface RevenueSummary {
  revenue: number
  returnsAmount: number
  costOfGoodsSold: number
  profit: number
  saleCount: number
}

/** Cost-of-goods-sold uses each book's CURRENT cost_price, not the cost at
 * the actual time of sale (that historical cost isn't tracked per-sale) —
 * an acceptable approximation for a first version unless costs turn out to
 * change often enough for it to matter in practice (see plan notes).
 * Revenue comes from sales.total_amount (already net of any discount),
 * NOT a sum of sale_items.subtotal — that column is pre-discount, so
 * summing it would overstate revenue on any discounted sale.
 * Returns are netted out of both revenue and cost using that same current
 * cost_price, on the returns that fall within the date range (by when the
 * return happened, not the original sale date). */
export function getRevenueSummary(fromDate: string, toDate: string): RevenueSummary {
  const sold = db
    .prepare(
      `SELECT
         COALESCE((SELECT SUM(total_amount) FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?)), 0) as revenue,
         COALESCE(SUM(si.quantity * b.cost_price), 0) as cost,
         COUNT(DISTINCT s.id) as saleCount
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       JOIN books b ON b.id = si.book_id
       WHERE date(s.created_at) BETWEEN date(?) AND date(?)`,
    )
    .get(fromDate, toDate, fromDate, toDate) as { revenue: number; cost: number; saleCount: number }

  const returned = db
    .prepare(
      `SELECT
         COALESCE(SUM(r.refund_amount), 0) as refunds,
         COALESCE(SUM(r.quantity * b.cost_price), 0) as cost
       FROM returns r
       JOIN books b ON b.id = r.book_id
       WHERE date(r.created_at) BETWEEN date(?) AND date(?)`,
    )
    .get(fromDate, toDate) as { refunds: number; cost: number }

  const revenue = sold.revenue - returned.refunds
  const costOfGoodsSold = sold.cost - returned.cost

  return {
    revenue,
    returnsAmount: returned.refunds,
    costOfGoodsSold,
    profit: revenue - costOfGoodsSold,
    saleCount: sold.saleCount,
  }
}

export interface ReorderItem {
  id: number
  title: string
  category: string
  quantity: number
  low_stock_threshold: number
  suggestedReorder: number
}

/** Suggests topping each low-stock title back up to double its alert
 * threshold — a simple buffer, not a demand forecast. */
export function getReorderList(): ReorderItem[] {
  const rows = db
    .prepare(
      `SELECT id, title, category, quantity, low_stock_threshold FROM books
       WHERE quantity <= low_stock_threshold ORDER BY quantity ASC`,
    )
    .all() as Pick<Book, 'id' | 'title' | 'category' | 'quantity' | 'low_stock_threshold'>[]

  return rows.map((b) => ({
    ...b,
    suggestedReorder: Math.max(b.low_stock_threshold * 2 - b.quantity, 1),
  }))
}

/** Flushes the WAL file into the main database file so a straight copy of
 * it is a complete, consistent snapshot — in WAL mode, recent commits can
 * otherwise sit only in the -wal file, not the main .db file. */
export function checkpointForBackup(): void {
  db.pragma('wal_checkpoint(TRUNCATE)')
}
