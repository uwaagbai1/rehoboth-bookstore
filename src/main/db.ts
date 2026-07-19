import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

// One file on disk, no server — matches the single-computer scope this app
// was built for. Lives in the OS's per-app data directory so it survives
// app updates/reinstalls untouched.
const dbPath = join(app.getPath('userData'), 'bookstore.db')
export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  -- barcode is UNIQUE but nullable on purpose: SQLite treats every NULL as
  -- distinct under a UNIQUE constraint, so this allows any number of books
  -- with no barcode at all (e.g. locally-made exercise books) while still
  -- rejecting two books sharing the same real barcode.
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    cost_price REAL NOT NULL DEFAULT 0,
    sale_price REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- discount_amount is informational only — total_amount is already the
  -- final charged amount (subtotal minus discount), so every existing sum
  -- over total_amount (dashboard, reports) stays correct without change;
  -- this column just lets a receipt/report show the discount that was applied.
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    total_amount REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    cash_received REAL NOT NULL,
    change_given REAL NOT NULL,
    cashier_id INTEGER REFERENCES cashiers(id),
    cashier_name TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id),
    book_title TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id),
    quantity_added INTEGER NOT NULL,
    cost_price_at_receipt REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    cashier_id INTEGER REFERENCES cashiers(id),
    cashier_name TEXT NOT NULL DEFAULT ''
  );

  -- Kept deliberately simple for a one-till shop: a name + a 4-digit PIN,
  -- no roles or permissions. The point is accountability (who rang up this
  -- sale or processed this return), not access control.
  CREATE TABLE IF NOT EXISTS cashiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A return doesn't edit or delete the original sale_items row (that stays
  -- the honest historical record of what was sold) — it's a separate ledger
  -- entry that gets netted against revenue in reports.
  CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    book_title TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    refund_amount REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    cashier_id INTEGER REFERENCES cashiers(id),
    cashier_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Cost price already has an audit trail via stock_receipts (logged every
  -- time stock comes in). This is the equivalent for sale_price, which only
  -- ever changes through a direct edit in Inventory.
  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id),
    old_sale_price REAL NOT NULL,
    new_sale_price REAL NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
  CREATE INDEX IF NOT EXISTS idx_stock_receipts_book_id ON stock_receipts(book_id);
  CREATE INDEX IF NOT EXISTS idx_price_history_book_id ON price_history(book_id);
  CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns(sale_id);
`)
