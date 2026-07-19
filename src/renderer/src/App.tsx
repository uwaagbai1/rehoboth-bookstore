import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import type { Cashier } from '../../main/queries'
import { CashierContext } from './context/CashierContext'
import { LockScreen } from './components/LockScreen'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { ReceiveStockPage } from './pages/ReceiveStockPage'
import { SellPage } from './pages/SellPage'
import { ReportsPage } from './pages/ReportsPage'
import { CashiersPage } from './pages/CashiersPage'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sell', label: 'Sell' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/receive', label: 'Receive Stock' },
  { to: '/reports', label: 'Reports' },
  { to: '/cashiers', label: 'Cashiers' },
]

export default function App(): JSX.Element {
  const [cashier, setCashier] = useState<Cashier | null>(null)

  // Once per app launch (after sign-in) — checked here rather than on the
  // Dashboard specifically, so it still runs no matter which page someone
  // opens first. The main process itself enforces "at most once per day",
  // so this being called again on a Switch User doesn't duplicate backups.
  useEffect(() => {
    if (cashier) window.api.system.runAutoBackupIfDue()
  }, [cashier])

  if (!cashier) {
    return <LockScreen onUnlock={setCashier} />
  }

  return (
    <CashierContext.Provider value={{ cashier, lock: () => setCashier(null) }}>
      <HashRouter>
        <aside className="sidebar">
          <h1>Rehoboth Bookstore</h1>
          <div className="subtitle">Inventory &amp; Sales</div>
          <nav>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div style={{ padding: '0 10px', fontSize: 12, color: 'var(--gold-500)', marginBottom: 8 }}>
              Signed in as {cashier.name}
            </div>
            <button
              className="nav-link"
              style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'transparent' }}
              onClick={() => setCashier(null)}
            >
              Switch User
            </button>
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sell" element={<SellPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/receive" element={<ReceiveStockPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/cashiers" element={<CashiersPage />} />
          </Routes>
        </main>
      </HashRouter>
    </CashierContext.Provider>
  )
}
