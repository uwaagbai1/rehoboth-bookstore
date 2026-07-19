import { contextBridge, ipcRenderer } from 'electron'
import type {
  Book,
  NewBookInput,
  CartLine,
  CompletedSale,
  DashboardStats,
  RevenueSummary,
  PriceChange,
  StockReceiptRecord,
  Cashier,
  ReturnRecord,
  ReorderItem,
} from '../main/queries'
import type { BackupConfig } from '../main/backupConfig'

// The only surface the renderer (a regular web page, effectively) can touch
// — no direct Node/filesystem/SQLite access from there, everything goes
// through these specific, typed calls into the main process.
const api = {
  books: {
    getAll: (): Promise<Book[]> => ipcRenderer.invoke('books:getAll'),
    search: (query: string): Promise<Book[]> => ipcRenderer.invoke('books:search', query),
    getByBarcode: (barcode: string): Promise<Book | undefined> =>
      ipcRenderer.invoke('books:getByBarcode', barcode),
    create: (input: NewBookInput): Promise<Book> => ipcRenderer.invoke('books:create', input),
    update: (id: number, input: Partial<NewBookInput>): Promise<Book> =>
      ipcRenderer.invoke('books:update', id, input),
    priceHistory: (bookId: number): Promise<PriceChange[]> =>
      ipcRenderer.invoke('books:priceHistory', bookId),
  },
  stock: {
    receive: (
      bookId: number,
      quantityAdded: number,
      costPriceAtReceipt: number,
      note: string,
      cashierId: number | null,
      cashierName: string,
    ): Promise<Book> =>
      ipcRenderer.invoke('stock:receive', bookId, quantityAdded, costPriceAtReceipt, note, cashierId, cashierName),
    history: (limit?: number): Promise<StockReceiptRecord[]> => ipcRenderer.invoke('stock:history', limit),
  },
  sales: {
    complete: (
      lines: CartLine[],
      cashReceived: number,
      discountAmount: number,
      cashierId: number | null,
      cashierName: string,
    ): Promise<CompletedSale> =>
      ipcRenderer.invoke('sales:complete', lines, cashReceived, discountAmount, cashierId, cashierName),
    history: (limit?: number): Promise<CompletedSale[]> => ipcRenderer.invoke('sales:history', limit),
    processReturn: (
      saleId: number,
      bookId: number,
      quantity: number,
      note: string,
      cashierId: number | null,
      cashierName: string,
    ): Promise<ReturnRecord> =>
      ipcRenderer.invoke('sales:processReturn', saleId, bookId, quantity, note, cashierId, cashierName),
    returnsForSale: (saleId: number): Promise<ReturnRecord[]> =>
      ipcRenderer.invoke('sales:returnsForSale', saleId),
  },
  cashiers: {
    getAll: (): Promise<Cashier[]> => ipcRenderer.invoke('cashiers:getAll'),
    create: (name: string, pin: string): Promise<Cashier> => ipcRenderer.invoke('cashiers:create', name, pin),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('cashiers:delete', id),
    verifyPin: (cashierId: number, pin: string): Promise<Cashier | null> =>
      ipcRenderer.invoke('cashiers:verifyPin', cashierId, pin),
  },
  dashboard: {
    stats: (): Promise<DashboardStats> => ipcRenderer.invoke('dashboard:stats'),
  },
  reports: {
    revenue: (fromDate: string, toDate: string): Promise<RevenueSummary> =>
      ipcRenderer.invoke('reports:revenue', fromDate, toDate),
    reorderList: (): Promise<ReorderItem[]> => ipcRenderer.invoke('reports:reorderList'),
  },
  system: {
    printReceipt: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('system:printReceipt'),
    exportBackup: (): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('system:exportBackup'),
    getBackupConfig: (): Promise<BackupConfig> => ipcRenderer.invoke('system:getBackupConfig'),
    chooseBackupFolder: (): Promise<BackupConfig> => ipcRenderer.invoke('system:chooseBackupFolder'),
    backupNow: (): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('system:backupNow'),
    runAutoBackupIfDue: (): Promise<{ ranBackup: boolean; result?: { success: boolean; path?: string; error?: string } }> =>
      ipcRenderer.invoke('system:runAutoBackupIfDue'),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
