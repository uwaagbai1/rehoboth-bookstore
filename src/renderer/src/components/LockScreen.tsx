import { useEffect, useState } from 'react'
import type { Cashier } from '../../../main/queries'

interface Props {
  onUnlock: (cashier: Cashier) => void
}

type Step = 'loading' | 'setup' | 'pick' | 'pin'

export function LockScreen({ onUnlock }: Props): JSX.Element {
  const [step, setStep] = useState<Step>('loading')
  const [cashiers, setCashiers] = useState<Cashier[]>([])
  const [selected, setSelected] = useState<Cashier | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Setup form (only shown when no cashier exists yet)
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')

  useEffect(() => {
    window.api.cashiers.getAll().then((list) => {
      setCashiers(list)
      setStep(list.length === 0 ? 'setup' : 'pick')
    })
  }, [])

  function pickCashier(cashier: Cashier): void {
    setSelected(cashier)
    setPin('')
    setError(null)
    setStep('pin')
  }

  async function submitPin(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setError(null)
    const result = await window.api.cashiers.verifyPin(selected.id, pin)
    setSaving(false)
    if (!result) {
      setError('Incorrect PIN.')
      setPin('')
      return
    }
    onUnlock(result)
  }

  async function submitSetup(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const cashier = await window.api.cashiers.create(newName.trim(), newPin)
      onUnlock(cashier)
    } catch {
      setError('Could not set up that cashier — try again.')
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--maroon-900)',
      }}
    >
      <div className="card" style={{ width: 360 }}>
        <h2 style={{ marginTop: 0, textAlign: 'center', color: 'var(--maroon-900)' }}>Rehoboth Bookstore</h2>

        {step === 'loading' && <p style={{ textAlign: 'center', color: 'var(--ink-muted)' }}>Loading…</p>}

        {step === 'setup' && (
          <form onSubmit={submitSetup}>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13, textAlign: 'center' }}>
              First time setup — add the first cashier.
            </p>
            {error && <div className="error-banner">{error}</div>}
            <div className="field">
              <label>Name</label>
              <input autoFocus required value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="field">
              <label>4-digit PIN</label>
              <input
                required inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving || newPin.length !== 4}>
              {saving ? 'Setting up…' : 'Get Started'}
            </button>
          </form>
        )}

        {step === 'pick' && (
          <>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13, textAlign: 'center', marginTop: 0 }}>Who's on the till?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cashiers.map((c) => (
                <button key={c.id} className="btn btn-ghost" style={{ justifyContent: 'center' }} onClick={() => pickCashier(c)}>
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'pin' && selected && (
          <form onSubmit={submitPin}>
            <p style={{ color: 'var(--ink-muted)', fontSize: 13, textAlign: 'center', marginTop: 0 }}>
              Enter PIN for <strong>{selected.name}</strong>
            </p>
            {error && <div className="error-banner">{error}</div>}
            <div className="field">
              <input
                autoFocus type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} disabled={saving || pin.length !== 4}>
              {saving ? 'Checking…' : 'Unlock'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setStep('pick')}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
