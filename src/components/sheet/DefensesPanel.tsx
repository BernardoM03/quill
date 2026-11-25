import type { SheetStats } from '../../api/characters';
import { defenseRows } from './defenses';
import { DefenseRow } from './SheetPlay';
import { SidePanel } from './SidePanel';
import '../DeleteCampaignDialog.css';
import '../RulesText.css';
import './Sheet.css';

// The full list of resistances and immunities in the side panel, with tooltips on headings and rows.
export function DefensesPanel({ defenses, onClose }: { defenses: SheetStats['defenses'] | null, onClose: () => void }) {
  const rows = defenseRows(defenses);
  const groups = [
    ['Resistances', 'resistance', rows.filter(r => r.kind === 'R')],
    ['Immunities', 'immunity', rows.filter(r => r.kind === 'I')],
  ] as const;
  return (
    <SidePanel label="Defenses" onClose={onClose}>
      <div className="rest-dialog__header">
        <h2 className="delete-dialog__title">Defenses</h2>
        <button type="button" className="rest-dialog__close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {groups.map(([title, term, list]) => (
        <div key={title} className="defenses-panel__group">
          <h3 className="rest-dialog__heading"><span className="rules-defined" data-term={term} tabIndex={0}>{title}</span></h3>
          {list.length === 0 ? <p className="muted">None</p> : (
            <ul className="sheet-defenses__list defenses-panel__list">
              {list.map(r => <DefenseRow key={r.kind + r.name} row={r} />)}
            </ul>
          )}
        </div>
      ))}
      {rows.some(r => r.condition) && (
        <p className="sheet-box__note">* Only while the named feature is active (hover the * to see which).</p>
      )}
      <div className="delete-dialog__actions">
        <button type="button" className="setting-button" onClick={onClose}>Done</button>
      </div>
    </SidePanel>
  );
}
