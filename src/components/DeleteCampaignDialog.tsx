import { deleteCampaign, shortCampaignId } from '../api/campaigns'
import TypeToConfirmDialog from './TypeToConfirmDialog'

// Asks before deleting a campaign: the Delete button stays disabled until the user
// types the campaign's short id. onDeleted runs once the server has removed it.
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
