import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { shortCampaignId } from '../api/campaigns'
import type { Campaign } from '../datatypes/campaign'
import DeleteCampaignDialog from './DeleteCampaignDialog'
import './CampaignCard.css'

export default function CampaignCard({ campaign, onDeleted }: { campaign: Campaign; onDeleted: (id: string) => void }) {
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Edit and delete are GM-only, and the server refuses them for players anyway.
  const isGm = campaign.role !== 'player'

  return (
    <div className="campaign-card">
      <div className="campaign-card__head">
        <div className="campaign-card__body">
          <h3 className="campaign-card__title">{campaign.name}</h3>
          <span className="campaign-card__id">#{shortCampaignId(campaign.id)}</span>
        </div>
        {isGm && <button
          type="button"
          className="campaign-card__delete"
          aria-label={`Delete ${campaign.name}`}
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
          onClick={() => navigate(`/campaign/${campaign.id}`)}
        >
          Open
        </button>
        {/* The same page serves as settings for the GM and read-only Campaign Information for players. */}
        <button
          className="setting-button setting-button--quiet"
          onClick={() => navigate(`/campaignsettings/${campaign.id}`)}
        >
          {isGm ? 'Edit' : 'Info'}
        </button>
      </div>
      {confirmingDelete && (
        <DeleteCampaignDialog
          id={campaign.id}
          name={campaign.name}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => onDeleted(campaign.id)}
        />
      )}
    </div>
  )
}
