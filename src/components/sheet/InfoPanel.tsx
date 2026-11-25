import { RulesText } from '../RulesText';
import { SidePanel } from './SidePanel';
import '../DeleteCampaignDialog.css';
import './Sheet.css';

// A feature or spell picked in the Details panel.
export interface SheetInfo {
  id: string,
  title: string,
  // A line under the title, such as a feature's source or how a spell is cast.
  meta?: string,
  // Rules text in Markdown.
  text: string,
}

// Shows a feature's or spell's rules text beside the sheet instead of unfolding it in the list.
export function InfoPanel({ info, onClose }: { info: SheetInfo, onClose: () => void }) {
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
