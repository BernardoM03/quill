import { useNavigate } from 'react-router-dom'
import './CampaignCard.css'

export default function CampaignCard({ props }: { props: { name: string; id: string } }) {
  const navigate = useNavigate()

  return (
    <div className="campaign-card">
      <div className="campaign-card__body">
        <h3 className="campaign-card__title">{props.name}</h3>
        <span className="campaign-card__id">#{props.id.slice(0, 8)}</span>
      </div>
      <div className="campaign-card__actions">
        <button
          className="setting-button"
          onClick={() => navigate(`/campaign/${props.id}`)}
        >
          Open
        </button>
        <button
          className="setting-button setting-button--quiet"
          onClick={() => navigate(`/campaignsettings/${props.id}`)}
        >
          Edit
        </button>
      </div>
    </div>
  )
}