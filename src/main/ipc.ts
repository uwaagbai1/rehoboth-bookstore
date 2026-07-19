import { app, dialog, ipcMain } from 'electron'
import { copyFileSync } from 'fs'
import { join } from 'path'
import * as queries from './queries'
import { readBackupConfig, writeBackupConfig } from './backupConfig'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function runFolderBackup(folder: string): { success: boolean; path?: string; error?: string } {
  queries.checkpointForBackup()
  const dbPath = join(app.getPath('userData'), 'bookstore.db')
  const destPath = join(folder, `rehoboth-bookstore-backup-${new Date().toISOString().slice(0, 10)}.db`)
  try {
    copyFileSync(dbPath, destPath)
    writeBackupConfig({ folder, lastBackupAt: new Date().toISOString() })
    return { success: true, path: destPath }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not write the backup file.' }
  }
}

/** Every renderer→main call goes through here — the renderer never touches
 * SQLite directly (better-sqlite3 is a native Node module, not usable from
 * a browser-context renderer), it just calls window.api.* (exposed via
 * preload) which invokes these handlers. Each handler is a thin pass-
 * through to queries.ts so the actual DB logic lives in one place. */
export function registerIpcHandlers(): void {
  ipcMain.handle('books:getAll', () => queries.getAllBooks())
  ipcMain.handle('books:search', (_e, query: string) => queries.searchBooks(query))
  ipcMain.handle('books:getByBarcode', (_e, barcode: string) => queries.getBookByBarcode(barcode))
  ipcMain.handle('books:create', (_e, input: queries.NewBookInput) => queries.createBook(input))
  ipcMain.handle('books:update', (_e, id: number, input: Partial<queries.NewBookInput>) =>
    queries.updateBook(id, input),
  )
  ipcMain.handle('books:priceHistory', (_e, bookId: number) => queries.getPriceHistory(bookId))

  ipcMain.handle(
    'stock:receive',
    (
      _e,
      bookId: number,
      quantityAdded: number,
      costPriceAtReceipt: number,
      note: string,
      cashierId: number | null,
      cashierName: string,
    ) => queries.receiveStock(bookId, quantityAdded, costPriceAtReceipt, note, cashierId, cashierName),
  )
  ipcMain.handle('stock:history', (_e, limit?: number) => queries.getStockReceiptHistory(limit))

  ipcMain.handle(
    'sales:complete',
    (
      _e,
      lines: queries.CartLine[],
      cashReceived: number,
      discountAmount: number,
      cashierId: number | null,
      cashierName: string,
    ) => queries.completeSale(lines, cashReceived, discountAmount, cashierId, cashierName),
  )
  ipcMain.handle('sales:history', (_e, limit?: number) => queries.getSalesHistory(limit))
  ipcMain.handle(
    'sales:processReturn',
    (
      _e,
      saleId: number,
      bookId: number,
      quantity: number,
      note: string,
      cashierId: number | null,
      cashierName: string,
    ) => queries.processReturn(saleId, bookId, quantity, note, cashierId, cashierName),
  )
  ipcMain.handle('sales:returnsForSale', (_e, saleId: number) => queries.getReturnsForSale(saleId))

  ipcMain.handle('cashiers:getAll', () => queries.getAllCashiers())
  ipcMain.handle('cashiers:create', (_e, name: string, pin: string) => queries.createCashier(name, pin))
  ipcMain.handle('cashiers:delete', (_e, id: number) => queries.deleteCashier(id))
  ipcMain.handle('cashiers:verifyPin', (_e, cashierId: number, pin: string) =>
    queries.verifyCashierPin(cashierId, pin),
  )

  ipcMain.handle('dashboard:stats', () => queries.getDashboardStats())
  ipcMain.handle('reports:revenue', (_e, fromDate: string, toDate: string) =>
    queries.getRevenueSummary(fromDate, toDate),
  )
  ipcMain.handle('reports:reorderList', () => queries.getReorderList())

  // Prints straight to the OS default printer with no dialog — the
  // supermarket-till experience. Relies on the renderer's @media print CSS
  // scoping output down to just the .receipt element (see index.css);
  // without that, this would silently print the whole app window since
  // there's no print-preview dialog to catch a scoping mistake.
  ipcMain.handle('system:printReceipt', async (event) => {
    // Silent printing needs a target — don't assume the OS has a default
    // printer set (many setups have one installed but never marked
    // default). Prefer the actual default if there is one, otherwise fall
    // back to whichever printer is available.
    const printers = await event.sender.getPrintersAsync()
    if (printers.length === 0) {
      return { success: false, error: 'No printer found. Make sure a printer is installed and turned on.' }
    }
    const target = printers.find((p) => p.isDefault) ?? printers[0]

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      event.sender.print({ silent: true, printBackground: true, deviceName: target.name }, (success, errorReason) => {
        resolve({ success, error: success ? undefined : errorReason })
      })
    })
  })

  // Copies the live database out to wherever the user picks (a USB drive,
  // cloud-synced folder, etc.) — the only real protection against losing
  // everything to a disk failure or theft, since it's normally one file on
  // one machine with nothing else backing it up.
  ipcMain.handle('system:exportBackup', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Backup',
      defaultPath: `rehoboth-bookstore-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database Backup', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { success: false }

    queries.checkpointForBackup()
    const dbPath = join(app.getPath('userData'), 'bookstore.db')
    try {
      copyFileSync(dbPath, filePath)
      return { success: true, path: filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Could not write the backup file.' }
    }
  })

  // Point this at a folder once (ideally one synced by Dropbox/Google
  // Drive/OneDrive) and every day the app is opened, it silently drops a
  // fresh copy there — no dialog, no remembering to click anything. The
  // one-off "Export Backup" above still exists for a quick ad-hoc copy.
  ipcMain.handle('system:getBackupConfig', () => readBackupConfig())

  ipcMain.handle('system:chooseBackupFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose Automatic Backup Folder',
      properties: ['openDirectory'],
    })
    if (canceled || filePaths.length === 0) return readBackupConfig()
    const config = readBackupConfig()
    writeBackupConfig({ ...config, folder: filePaths[0] })
    return readBackupConfig()
  })

  ipcMain.handle('system:backupNow', () => {
    const config = readBackupConfig()
    if (!config.folder) return { success: false, error: 'No backup folder chosen yet.' }
    return runFolderBackup(config.folder)
  })

  // Called once per app launch (see App.tsx) — runs at most once per day,
  // so opening the app multiple times in a day doesn't spam the folder
  // with duplicate copies.
  ipcMain.handle('system:runAutoBackupIfDue', () => {
    const config = readBackupConfig()
    if (!config.folder) return { ranBackup: false as const }
    const last = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0
    if (Date.now() - last < ONE_DAY_MS) return { ranBackup: false as const }
    return { ranBackup: true as const, result: runFolderBackup(config.folder) }
  })
}
