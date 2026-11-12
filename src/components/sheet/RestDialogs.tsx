import { useState, type ReactNode } from 'react';

import { takeRest, type playState, type restRequest, type restResult } from '../../api/characters';
import { useEntry } from '../../packs/usePacks';
import { RulesText } from '../RulesText';
import '../DeleteCampaignDialog.css';
import { SidePanel } from './SidePanel';
import './Sheet.css';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function errorMessage(err: unknown): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Could not take the rest. Try again.';
}

interface restDialogProps {
  characterId: string,
  state: playState,
  onRested: (state: playState) => void,
  onClose: () => void,
}

// The frame both rest panels share (in a SidePanel beside the sheet): it stays open after the
// rest to show what happened, until Done. The × closes it at any time, as does Escape.
function RestDialog({ title, children, actions, result, error, onDismiss, downed }: {
  title: string, children: ReactNode, actions: ReactNode, result: string | null, error: string | null,
  onDismiss: () => void,
  // At 0 Hit Points: the rules don't allow starting a rest.
  downed?: boolean,
}) {
  return (
    <>
      <div className="rest-dialog__header">
        <h2 className="delete-dialog__title">{title}</h2>
        <button type="button" className="rest-dialog__close" aria-label="Close" onClick={onDismiss}>×</button>
      </div>
      <div className="delete-dialog__body rest-dialog__body">{children}</div>
      {result && <p className="rest-dialog__result" role="status">{result}</p>}
      {downed && !result && <p className="delete-dialog__error">You need at least 1 Hit Point to start a rest.</p>}
      {error && <p className="delete-dialog__error">{error}</p>}
      <div className="delete-dialog__actions">{actions}</div>
    </>
  );
}


const SHORT_REST_RULE = 'srd-5.2:rule/short-rest';
const LONG_REST_RULE = 'srd-5.2:rule/long-rest';
// Where the Long Rest rule's opening paragraphs end and its benefits begin.
const BENEFITS = '**Benefits of the Rest.**';

// A rest rule's text exactly as the pack has it (packs/srd-5.2/rules.json), through
// RulesText like other rules text. part splits the Long Rest rule at its benefits: intro is
// what comes before them, details the benefits onward; left out, the whole text.
function RuleDescription({ id, part, className }: { id: string, part?: 'intro' | 'details', className?: string }) {
  const { entry, loading } = useEntry('rules', id);
  if (loading) return null;
  const text = entry?.description;
  if (!text) return <p className="muted">The rules text for this rest isn’t installed.</p>;
  const at = text.indexOf(BENEFITS);
  const shown = !part || at < 0 ? (part === 'details' ? '' : text) : part === 'intro' ? text.slice(0, at) : text.slice(at);
  return shown.trim() ? <RulesText className={className}>{shown.trim()}</RulesText> : null;
}


function useRest(characterId: string, onRested: (state: playState) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<restResult | null>(null);
  function rest(body: restRequest) {
    setBusy(true);
    setError(null);
    takeRest(characterId, body)
      .then(({ state, rest: done }) => { onRested(state); setResult(done); })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  }
  return { busy, error, result, setResult, rest };
}

function Checkbox({ checked, disabled, onChange, children }: {
  checked: boolean, disabled?: boolean, onChange: (checked: boolean) => void, children: ReactNode,
}) {
  return (
    <label className="rest-dialog__check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// Short rest: pick the Hit Point Dice to spend (one box each), the server rolls them.
export function ShortRestDialog({ characterId, state, onRested, onClose, className, hitDie, conModifier }: restDialogProps & {
  className: string | null, hitDie: number | null, conModifier: number,
}) {
  const { busy, error, result, setResult, rest } = useRest(characterId, onRested);
  const [resetMax, setResetMax] = useState(false);
  const [applyHealing, setApplyHealing] = useState(true);
  const [picked, setPicked] = useState(0);
  const left = state.hitDice.total - state.hitDice.spent;
  const count = Math.min(picked, left);

  function reset() {
    setResetMax(false);
    setApplyHealing(true);
    setPicked(0);
    setResult(null);
  }

  const summary = result && result.kind === 'short'
    ? (result.rolls.length === 0
      ? 'Rest taken. No Hit Point Dice spent.'
      : `Rolled ${result.rolls.join(', ')}${result.conModifier ? ` (${signed(result.conModifier)} each)` : ''}: `
        + (result.applied ? `regained ${result.healed} hit points.` : `${result.healed} hit points, not applied.`))
    : null;

  return (
    <SidePanel label="Short Rest" onClose={onClose}>
      <RestDialog title="Short Rest" result={summary} error={error} onDismiss={onClose} downed={state.currentHp === 0}
        actions={result ? (
          <button type="button" className="setting-button" autoFocus onClick={onClose}>Done</button>
        ) : (
          <>
            <button type="button" className="setting-button setting-button--quiet rest-dialog__cancel" disabled={busy}
              onClick={onClose}>Cancel</button>
            <button type="button" className="setting-button setting-button--quiet" disabled={busy} onClick={reset}>Reset</button>
            <button type="button" className="setting-button" disabled={busy || state.currentHp === 0}
              onClick={() => rest({ type: 'short', hitDice: count, applyHealing, resetMaxHp: resetMax })}>
              {busy ? 'Resting…' : 'Take Short Rest'}
            </button>
          </>
        )}>
        <RuleDescription id={SHORT_REST_RULE} />

        <h3 className="rest-dialog__heading">Recover</h3>
        <Checkbox checked={resetMax} disabled={state.maxHpOverride == null} onChange={setResetMax}>
          Reset maximum HP changes during this rest
        </Checkbox>
        <Checkbox checked={applyHealing} onChange={setApplyHealing}>
          Automatically apply healing with the dice result
        </Checkbox>

        <h3 className="rest-dialog__heading">
          {className ?? 'Hit Point Dice'}{' '}
          <span className="rest-dialog__aside">
            (Hit Die: 1d{hitDie ?? '?'}{conModifier ? signed(conModifier) : ''} • Total: {state.hitDice.total})
          </span>
        </h3>
        {left === 0 ? (
          <p className="muted">No Hit Point Dice left. A long rest brings them back.</p>
        ) : (
          <div className="rest-dialog__dice" role="group" aria-label={`Hit Point Dice to spend: ${count} of ${left}`}>
            {Array.from({ length: state.hitDice.total }, (_, i) => {
              const spent = i >= left;
              const on = i < count;
              return (
                <button key={i} type="button" disabled={spent || busy || result != null}
                  className={`sheet-pip rest-dialog__die${on ? ' sheet-pip--filled' : ''}${spent ? ' rest-dialog__die--spent' : ''}`}
                  aria-pressed={on} aria-label={spent ? `Hit Point Die ${i + 1} (already spent)` : `Spend ${i + 1} Hit Point ${i ? 'Dice' : 'Die'}`}
                  title={spent ? 'Already spent' : undefined}
                  onClick={() => setPicked(on && i + 1 === count ? i : i + 1)} />
              );
            })}
          </div>
        )}
      </RestDialog>
    </SidePanel>
  );
}

// Long rest: everything back, Hit Point Dice under the rule picked.
export function LongRestDialog({ characterId, state, onRested, onClose }: restDialogProps) {
  const { busy, error, result, setResult, rest } = useRest(characterId, onRested);
  const [recovery, setRecovery] = useState<'all' | 'half'>('all');
  const [resetMax, setResetMax] = useState(false);
  const spent = state.hitDice.spent;
  const diceBack = recovery === 'all' ? spent : Math.min(spent, Math.max(1, Math.floor(state.hitDice.total / 2)));
  const maxAfter = resetMax ? state.workedOutMaxHp : state.maxHp;
  const hpBack = maxAfter != null && state.currentHp != null ? Math.max(0, maxAfter - state.currentHp) : 0;

  function reset() {
    setRecovery('all');
    setResetMax(false);
    setResult(null);
  }

  const summary = result && result.kind === 'long'
    ? `Rested: regained ${result.healed} hit points and ${result.hitDiceRecovered} Hit Point ${result.hitDiceRecovered === 1 ? 'Die' : 'Dice'}.`
    : null;

  return (
    <SidePanel label="Long Rest" onClose={onClose}>
      <RestDialog title="Long Rest" result={summary} error={error} onDismiss={onClose} downed={state.currentHp === 0}
        actions={result ? (
          <button type="button" className="setting-button" autoFocus onClick={onClose}>Done</button>
        ) : (
          <>
            <button type="button" className="setting-button setting-button--quiet rest-dialog__cancel" disabled={busy}
              onClick={onClose}>Cancel</button>
            <button type="button" className="setting-button setting-button--quiet" disabled={busy} onClick={reset}>Reset</button>
            <button type="button" className="setting-button" disabled={busy || state.currentHp === 0}
              onClick={() => rest({ type: 'long', hitDiceRecovery: recovery, resetMaxHp: resetMax })}>
              {busy ? 'Resting…' : 'Take Long Rest'}
            </button>
          </>
        )}>
        <RuleDescription id={LONG_REST_RULE} part="intro" />

        <h3 className="rest-dialog__heading">Hit Point Dice</h3>
        <label className="rest-dialog__radio">
          <input type="radio" name="hit-dice-recovery" checked={recovery === 'all'} onChange={() => setRecovery('all')} />
          <span>Recover all Hit Point Dice <span className="rest-dialog__aside">2024 rules</span></span>
        </label>
        <label className="rest-dialog__radio">
          <input type="radio" name="hit-dice-recovery" checked={recovery === 'half'} onChange={() => setRecovery('half')} />
          <span>Recover half of them <span className="rest-dialog__aside">2014 rules</span></span>
        </label>

        <h3 className="rest-dialog__heading">Recover</h3>
        <p className="rest-dialog__recover">
          {hpBack} Hit Points, {diceBack} Hit Point {diceBack === 1 ? 'Die' : 'Dice'}
          {(Object.keys(state.spellSlots).length > 0 || state.pactSlots) && ', all spell slots'}
          {state.exhaustion > 0 && ', 1 level of exhaustion'}
        </p>
        <Checkbox checked={resetMax} disabled={state.maxHpOverride == null} onChange={setResetMax}>
          Reset maximum HP changes during this rest
        </Checkbox>

        <RuleDescription id={LONG_REST_RULE} part="details" className="rest-dialog__rules" />
      </RestDialog>
    </SidePanel>
  );
}
