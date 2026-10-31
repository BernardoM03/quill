import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { shortCampaignId } from '../api/campaigns'
import DeleteCampaignDialog from './DeleteCampaignDialog'
import './CampaignCard.css'

export default function CampaignCard({ props, onDeleted }: { props: { name: string; id: string; role?: 'gm' | 'player' }; onDeleted: (id: string) => void }) {
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Edit and delete are GM-only; the server refuses them for players anyway.
  const isGm = props.role !== 'player'

  return (
    <div className="campaign-card">
      <div className="campaign-card__head">
        <div className="campaign-card__body">
          <h3 className="campaign-card__title">{props.name}</h3>
          <span className="campaign-card__id">#{shortCampaignId(props.id)}</span>
        </div>
        {isGm && <button
          type="button"
          className="campaign-card__delete"
          aria-label={`Delete ${props.name}`}
          title="Delete campaign"
          onClick={() => setConfirmingDelete(true)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.75 9.5h6.5L12 4M6.75 6.5v4.5M9.25 6.5v4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>}
      </div>
      <div className="campaign-card__actions">
        <button
          className="setting-button"
          onClick={() => navigate(`/campaign/${props.id}`)}
        >
          Open
        </button>
        {/* Same page either way: settings for the GM, read-only Campaign Information for players. */}
        <button
          className="setting-button setting-button--quiet"
          onClick={() => navigate(`/campaignsettings/${props.id}`)}
        >
          {isGm ? 'Edit' : 'Info'}
        </button>
      </div>
      {confirmingDelete && (
        <DeleteCampaignDialog
          id={props.id}
          name={props.name}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => onDeleted(props.id)}
        />
      )}
    </div>
  )
}
