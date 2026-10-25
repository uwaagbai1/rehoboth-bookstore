# Rehoboth Bookstore

A desktop inventory and point-of-sale app for a school bookstore. It runs on a
single Windows computer with no server: one SQLite file holds the books,
sales and stock records.

Built with Electron, React and TypeScript, using better-sqlite3.

## Features

- **Selling:** scan a barcode (USB scanner) or search by title, apply a
  discount, take cash and show the change, then print a receipt
- **Returns** against a past sale
- **Stock:** receive new stock with its cost price, keep a price history, and
  flag books that are running low; books without a barcode (e.g. locally
  made exercise books) are supported
- **Cashiers:** each cashier has a PIN, the app locks between users, and
  every sale records who made it
- **Reports:** daily sales, revenue, cost of goods sold, profit and a reorder
  list for a chosen date range
- **Backups:** export the database by hand, or pick a folder for automatic
  backups

## Run it

```bash
npm install
npm run dev        # development
npm run build:win  # Windows installer in dist/
```

A GitHub Actions workflow type-checks the code and builds the Windows
installer on every push to `main`.

## Project structure

```
src/
├── main/       # Electron main process: SQLite schema, queries, IPC, backups
├── preload/    # safe bridge between the UI and the main process
└── renderer/   # React UI: sell, inventory, receive stock, reports, cashiers
```
