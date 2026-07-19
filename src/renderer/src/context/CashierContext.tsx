import { createContext, useContext } from 'react'
import type { Cashier } from '../../../main/queries'

interface CashierContextValue {
  cashier: Cashier
  lock: () => void
}

export const CashierContext = createContext<CashierContextValue | null>(null)

// Every page that tags a sale/stock receipt/return with "who did this"
// reads from here rather than threading the cashier down as a prop.
export function useCashier(): CashierContextValue {
  const ctx = useContext(CashierContext)
  if (!ctx) throw new Error('useCashier must be used within a CashierContext.Provider')
  return ctx
}
