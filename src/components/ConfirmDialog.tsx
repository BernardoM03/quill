import { useEffect, useRef, useState, type ReactNode } from 'react'

import './DeleteCampaignDialog.css'

// A modal yes/no question, for actions that are easy to redo but shouldn't happen by
// accident. (Anything that can't be undone uses TypeToConfirmDialog instead.) Cancel has
// focus at first, so Enter or a stray click doesn't confirm. onConfirm does the work; its
// rejection's server message is shown in the dialog, which then stays open.
export default function ConfirmDialog({ title, confirmLabel, busyLabel, danger = false, onConfirm, onClose, children }: {
  title: string
  confirmLabel: string
  busyLabel: string
  danger?: boolean
  onConfirm: () => Promise<unknown>
  onClose: () => void
  children?: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  function handleConfirm() {
    setBusy(true)
    setError(null)
    onConfirm()
      .then(() => dialogRef.current?.close())
      .catch(err => {
        setError(err.response?.data?.error ?? `Could not ${confirmLabel.toLowerCase()}.`)
        setBusy(false)
      })
  }

  return (
    <dialog ref={dialogRef} className="delete-dialog" onClose={onClose}>
      <h2 className="delete-dialog__title">{title}</h2>
      {children && <div className="delete-dialog__body">{children}</div>}
      {error && <p className="delete-dialog__error">{error}</p>}
      <div className="delete-dialog__actions">
        <button type="button" className="setting-button setting-button--quiet" autoFocus disabled={busy}
          onClick={() => dialogRef.current?.close()}>
          Cancel
        </button>
        <button type="button" className={`setting-button${danger ? ' setting-button--danger' : ''}`} disabled={busy}
          onClick={handleConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
