import { useEffect, useRef, useState } from 'react'

import { deleteCampaign, shortCampaignId } from '../api/campaigns'
import './DeleteCampaignDialog.css'

// Asks before deleting a campaign: the Delete button stays disabled until the user
// types the campaign's short id. onDeleted runs once the server has removed it.
export default function DeleteCampaignDialog({ id, name, onClose, onDeleted }: {
  id: string
  name: string
  onClose: () => void
  onDeleted: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shortId = shortCampaignId(id)
  const matches = typed.trim() === shortId

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!matches || deleting) return

    setDeleting(true)
    deleteCampaign(id)
      .then(onDeleted)
      .catch((err) => {
        setError(err.response?.data?.error ?? 'Could not delete campaign.')
        setDeleting(false)
      })
  }

  return (
    <dialog ref={dialogRef} className="delete-dialog" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="delete-dialog__title">Delete “{name}”?</h2>
        <label className="delete-dialog__label">
          <span>Type <code>{shortId}</code> to confirm:</span>
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
          <button type="submit" className="setting-button setting-button--danger" disabled={!matches || deleting}>
            {deleting ? 'Deleting…' : 'Delete Campaign'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
