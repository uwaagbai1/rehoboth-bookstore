import { useEffect, useState } from 'react'
import type { Cashier } from '../../../main/queries'
import { useCashier } from '../context/CashierContext'

export function CashiersPage(): JSX.Element {
  const { cashier: currentCashier } = useCashier()
  const [cashiers, setCashiers] = useState<Cashier[]>([])
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load(): Promise<void> {
    setCashiers(await window.api.cashiers.getAll())
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await window.api.cashiers.create(name.trim(), pin)
      setName('')
      setPin('')
      await load()
    } catch {
      setError('Could not add that cashier.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Cashier): Promise<void> {
    if (c.id === currentCashier.id) {
      setError("You can't remove the cashier you're currently signed in as.")
      return
    }
    await window.api.cashiers.delete(c.id)
    await load()
  }

  return (
    <div>
      <h2 className="page-title">Cashiers</h2>
      <p className="page-subtitle">Who can sign in at the till.</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Add Cashier</h3>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 14, alignItems: 'end' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>4-digit PIN</label>
              <input
                required inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving || pin.length !== 4}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Added</th><th /></tr>
          </thead>
          <tbody>
            {cashiers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}{c.id === currentCashier.id && <span className="badge badge-ok" style={{ marginLeft: 8 }}>You</span>}</td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => handleDelete(c)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
