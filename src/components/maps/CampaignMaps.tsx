import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { listMaps, type mapSummary } from '../../api/maps';
import { AddMapDialog } from './AddMapDialog';
import './Maps.css';

// The campaign page's maps. Everyone sees the maps they may open (for a player, the public
// finalized ones; the server leaves the rest out); the GM also gets Add map. Renders
// nothing for a player while there are no maps to show.
export function CampaignMaps({ campaignId, canEdit }: { campaignId: string, canEdit: boolean }) {
  const navigate = useNavigate();
  const [maps, setMaps] = useState<mapSummary[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listMaps(campaignId).then(setMaps).catch(() => setMaps(null));
  }, [campaignId]);

  if (!maps || (maps.length === 0 && !canEdit)) return null;

  return (
    <div className="setting-section campaign-maps">
      <span className="setting-caption">Maps</span>
      {maps.length > 0 ? (
        <ul className="character-list">
          {maps.map(m => (
            <li key={m.id} className="character-row">
              <div className="character-row__info">
                <Link to={`/campaign/${campaignId}/maps/${m.id}`} className="character-row__name">{m.name}</Link>
                <span className="character-row__campaign">Hex map</span>
              </div>
              {m.status === 'draft' && <span className="character-row__badge character-row__badge--warning">Not finalized</span>}
              {canEdit && m.status === 'ready' && (
                <span className="character-row__badge">{m.visibility === 'public' ? 'Public' : 'Private'}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">This campaign has no maps yet.</p>
      )}
      {canEdit && (
        <div className="home-actions">
          <button type="button" className="setting-button" onClick={() => setAdding(true)}>Add map</button>
        </div>
      )}
      {adding && (
        <AddMapDialog campaignId={campaignId}
          onCreated={mapId => navigate(`/campaign/${campaignId}/maps/${mapId}`)}
          onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
