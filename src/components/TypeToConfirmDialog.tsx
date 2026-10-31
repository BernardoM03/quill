import { useEffect, useRef, useState, type ReactNode } from 'react'

import './DeleteCampaignDialog.css'

// A modal that keeps its danger button disabled until the user types `phrase` exactly.
// onConfirm does the work; its rejection's server message is shown in the dialog.
export default function TypeToConfirmDialog({ title, phrase, confirmLabel, busyLabel, onConfirm, onClose, children }: {
  title: string
  phrase: string
  confirmLabel: string
  busyLabel: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
  // Shown above the input: what will happen, and anything to do first.
  children?: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim() === phrase

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!matches || busy) return

    setBusy(true)
    onConfirm().catch((err) => {
      setError(err.response?.data?.error ?? `Could not ${confirmLabel.toLowerCase()}.`)
      setBusy(false)
    })
  }

  return (
    <dialog ref={dialogRef} className="delete-dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="delete-dialog__title">{title}</h2>
        {children}
        <label className="delete-dialog__label">
          <span>Type <code>{phrase}</code> to confirm:</span>
          <input
            className="delete-dialog__input"
            value={typed}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={e => setTyped(e.target.value)}
          />
        </label>
        {error && <p className="delete-dialog__error">{error}</p>}
        <div className="delete-dialog__actions">
          <button type="button" className="setting-button setting-button--quiet" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="setting-button setting-button--danger" disabled={!matches || busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
