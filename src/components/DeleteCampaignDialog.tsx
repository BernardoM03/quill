import { deleteCampaign, shortCampaignId } from '../api/campaigns'
import TypeToConfirmDialog from './TypeToConfirmDialog'

// Confirms deleting a campaign by typing its short id, then calls onDeleted once the server removes it.
export default function DeleteCampaignDialog({ id, name, onClose, onDeleted }: {
  id: string
  name: string
  onClose: () => void
  onDeleted: () => void
}) {
  return (
    <TypeToConfirmDialog
      title={`Delete “${name}”?`}
      phrase={shortCampaignId(id)}
      confirmLabel="Delete Campaign"
      busyLabel="Deleting…"
      onConfirm={() => deleteCampaign(id).then(onDeleted)}
      onClose={onClose}
    />
  )
}
