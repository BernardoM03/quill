import type { playState } from '../../api/characters';
import { useCollection } from '../../packs/usePacks';
import '../RulesText.css';
import type { playChange } from './SheetPlay';
import '../DeleteCampaignDialog.css';
import '../campaignSettings/CampaignSettings.css';
import { SidePanel } from './SidePanel';
import './Sheet.css';

const EXHAUSTION_ID = 'srd-5.2:condition/exhaustion';
const EXHAUSTION_LEVELS = [0, 1, 2, 3, 4, 5, 6];


// Every condition in the installed packs, one row each: its name and a switch to turn it on
// or off. What a condition does (the pack's own text) is a tooltip on its name, like any other
// rules word (GlossaryTooltips). Exhaustion comes last, as a level from – to 6. Each change
// shows at once and saves like the rest of the sheet.
// canEdit false (another player): the switches are shown but can't be changed.
export function ConditionsDialog({ state, canEdit, onChange, onClose }: {
  state: playState, canEdit: boolean, onChange: playChange, onClose: () => void,
}) {
  const { data: conditions, error } = useCollection('conditions');

  const list = conditions ? [...conditions.values()].filter(c => c.id !== EXHAUSTION_ID).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const exhaustion = conditions?.get(EXHAUSTION_ID);

  function toggle(id: string) {
    const next = state.conditions.includes(id) ? state.conditions.filter(c => c !== id) : [...state.conditions, id];
    onChange({ conditions: next }, { conditions: next });
  }

  function setExhaustion(level: number) {
    onChange({ exhaustion: level }, { exhaustion: level });
  }

  // A condition's name, carrying its glossary key: hover, focus or tap it for what it does.
  const term = (name: string) => (
    <span className="rules-defined" data-term={name.toLowerCase()} tabIndex={0}>{name}</span>
  );

  return (
    <SidePanel label="Conditions" onClose={onClose}>
      <div className="rest-dialog__header">
        <h2 className="delete-dialog__title">Conditions</h2>
        <button type="button" className="rest-dialog__close" aria-label="Close" onClick={onClose}>×</button>
      </div>

      {error && <p className="delete-dialog__error">Couldn’t load the conditions. Check your connection and reopen this.</p>}
      {!conditions && !error && <p className="muted">Loading…</p>}

      <ul className="conditions-dialog__list">
        {list.map(c => (
          <li key={c.id} className="conditions-dialog__item">
            <div className="conditions-dialog__row">
              <label className="conditions-dialog__toggle toggle-row">
                {term(c.name)}
                <input type="checkbox" role="switch" className="toggle-input" disabled={!canEdit}
                  checked={state.conditions.includes(c.id)} onChange={() => toggle(c.id)} />
                <span className="toggle" aria-hidden="true" />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {exhaustion && (
        <div className="conditions-dialog__item conditions-dialog__exhaustion">
          <div className="conditions-dialog__row">
            <span className="conditions-dialog__name">{term(exhaustion.name)}</span>
            <span className="conditions-dialog__level">Level {state.exhaustion || '–'}</span>
          </div>
          <div className="conditions-dialog__levels" role="radiogroup" aria-label="Exhaustion level">
            {EXHAUSTION_LEVELS.map(level => (
              <button key={level} type="button" role="radio" aria-checked={state.exhaustion === level} disabled={!canEdit}
                aria-label={level ? `Level ${level}` : 'None'}
                className={`conditions-dialog__level-button${state.exhaustion === level ? ' conditions-dialog__level-button--on' : ''}`}
                onClick={() => setExhaustion(level)}>
                {level || '–'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="delete-dialog__actions">
        <button type="button" className="setting-button" autoFocus onClick={onClose}>Done</button>
      </div>
    </SidePanel>
  );
}
