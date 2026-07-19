import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BackupConfig } from '../../../main/backupConfig'

interface DashboardStats {
  todaySalesTotal: number
  todaySalesCount: number
  inventoryValue: number
  lowStockCount: number
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} XOF`
}

export function DashboardPage(): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null)
  const [backingUp, setBackingUp] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.dashboard.stats().then((data) => {
      if (!cancelled) setStats(data)
    })
    window.api.system.getBackupConfig().then((data) => {
      if (!cancelled) setBackupConfig(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function chooseFolder(): Promise<void> {
    setBackupConfig(await window.api.system.chooseBackupFolder())
  }

  async function backupNow(): Promise<void> {
    setBackingUp(true)
    setBackupStatus(null)
    const result = await window.api.system.backupNow()
    setBackingUp(false)
    if (result.success && result.path) {
      setBackupStatus(`Backed up to ${result.path}`)
      setBackupConfig(await window.api.system.getBackupConfig())
    } else {
      setBackupStatus(result.error ? `Backup failed: ${result.error}` : 'Backup failed.')
    }
  }

  async function exportBackup(): Promise<void> {
    setBackupStatus(null)
    const result = await window.api.system.exportBackup()
    if (result.success && result.path) {
      setBackupStatus(`Backup saved to ${result.path}`)
    } else if (result.error) {
      setBackupStatus(`Backup failed: ${result.error}`)
    }
  }

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <p className="page-subtitle">Today at a glance.</p>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value">{stats ? formatCurrency(stats.todaySalesTotal) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Transactions Today</div>
          <div className="stat-value">{stats ? stats.todaySalesCount : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Inventory Value (cost)</div>
          <div className="stat-value">{stats ? formatCurrency(stats.inventoryValue) : '—'}</div>
        </div>
        <div className={`card stat-card${stats && stats.lowStockCount > 0 ? ' warn' : ''}`}>
          <div className="stat-label">Low Stock Titles</div>
          <div className="stat-value">{stats ? stats.lowStockCount : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <Link to="/sell" className="btn btn-primary">Start a Sale</Link>
        <Link to="/receive" className="btn btn-gold">Receive Stock</Link>
        <Link to="/inventory" className="btn btn-ghost">View Inventory</Link>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Backup</h3>
        <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
          Everything lives in one file on this computer. Point automatic backup at a folder synced by Dropbox,
          Google Drive, or OneDrive and it becomes an off-site cloud backup for free — the app just writes to
          that folder once a day and the sync client uploads it whenever there's internet.
        </p>

        {backupConfig?.folder ? (
          <p style={{ fontSize: 13, wordBreak: 'break-all' }}>
            Backing up to <strong>{backupConfig.folder}</strong>
            {backupConfig.lastBackupAt && (
              <> — last backup {new Date(backupConfig.lastBackupAt).toLocaleString()}</>
            )}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>No automatic backup folder set up yet.</p>
        )}

        {backupStatus && <p style={{ fontSize: 13, wordBreak: 'break-all' }}>{backupStatus}</p>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-gold" onClick={chooseFolder}>
            {backupConfig?.folder ? 'Change Folder' : 'Set Up Automatic Backup'}
          </button>
          <button className="btn btn-ghost" onClick={backupNow} disabled={!backupConfig?.folder || backingUp}>
            {backingUp ? 'Backing up…' : 'Backup Now'}
          </button>
          <button className="btn btn-ghost" onClick={exportBackup}>Export a Copy Elsewhere</button>
        </div>
      </div>
    </div>
  )
}
