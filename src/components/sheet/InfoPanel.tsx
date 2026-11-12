import { RulesText } from '../RulesText';
import { SidePanel } from './SidePanel';
import '../DeleteCampaignDialog.css';
import './Sheet.css';

// What the panel shows: a feature or spell picked in the Details panel.
export interface sheetInfo {
  id: string,
  title: string,
  // A line under the title: where a feature is from, how a spell is cast.
  meta?: string,
  // Rules text (Markdown).
  text: string,
}

// A feature's or spell's rules text, beside the sheet: clicking its name in the Details
// panel opens it here instead of unfolding it in the list.
export function InfoPanel({ info, onClose }: { info: sheetInfo, onClose: () => void }) {
  return (
    <SidePanel label={info.title} term={info.id.startsWith('term:') ? info.id.slice(5) : undefined} onClose={onClose}>
      <div className="rest-dialog__header">
        <h2 className="delete-dialog__title">{info.title}</h2>
        <button type="button" className="rest-dialog__close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {info.meta && <p className="info-panel__meta">{info.meta}</p>}
      {info.text ? <RulesText>{info.text}</RulesText> : <p className="muted">No description.</p>}
    </SidePanel>
  );
}
