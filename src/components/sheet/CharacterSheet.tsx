import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import type { CharacterSummary, PlayState } from '../../api/characters';
import { CharacterPortrait } from '../portrait/CharacterPortrait';
import { AbilityBoxes } from './AbilityScores';
import { ConditionsDialog } from './ConditionsDialog';
import { LongRestDialog, ShortRestDialog } from './RestDialogs';
import { DefensesPanel } from './DefensesPanel';
import { DetailsPanel } from './DetailsPanel';
import { InfoPanel, type SheetInfo } from './InfoPanel';
import { SheetInfoContext } from './sheetInfoContext';
import { DefensesConditionsBox, HitPointsBox, type PlayChange } from './SheetPlay';
import { HeadlineStats, ProficienciesBox, SavingThrowsBox, SensesBox, SheetBox, SkillsBox } from './SheetStats';
import './Sheet.css';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Not submitted', pending: 'Awaiting approval', rejected: 'Sent back',
};

// The owner's header portrait, which picks an image when empty or opens a replace/remove menu.
// Escape or clicking elsewhere closes the menu.
function PortraitControl({ character, portrait }: { character: CharacterSummary, portrait: PortraitActions }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const has = character.portraitVersion != null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const choose = (action: () => void) => { setOpen(false); action(); };

  return (
    <div className="sheet-portrait" ref={wrapper}>
      <button type="button" className="sheet-portrait__button"
        aria-label={has ? 'Change portrait' : 'Upload a portrait'} aria-haspopup={has ? 'menu' : undefined} aria-expanded={has ? open : undefined}
        title={has ? 'Change portrait' : 'Upload a portrait: you’ll frame it as a square, and large photos are shrunk first'}
        onClick={() => (has ? setOpen(o => !o) : portrait.onPick())}>
        <CharacterPortrait characterId={character.id} name={character.name} version={character.portraitVersion} size={64} />
        <span className="sheet-portrait__hint" aria-hidden="true">{has ? 'Change' : 'Upload'}</span>
      </button>
      {open && (
        <div className="sheet-portrait__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => choose(portrait.onPick)}>Replace Portrait</button>
          <button type="button" role="menuitem" className="sheet-portrait__remove" onClick={() => choose(portrait.onRemove)}>Remove</button>
        </div>
      )}
    </div>
  );
}

export interface PortraitActions {
  // Why the last pick or upload failed, shown under the header.
  error: string | null,
  onPick: () => void,
  onRemove: () => void,
}

// The character sheet, laid out like a paper one, stacking hit points and conditions first on narrow screens.
// Hover definitions are off here (data-no-terms), so rules words open in the side panel through SheetTerm instead.
export function CharacterSheet({ character, canEdit, isOwner, stateError, onStateChange, onRested, portrait }: {
  character: CharacterSummary,
  // The owner, the admin or the GM: may change the play state.
  canEdit: boolean,
  // The owner or the admin: may edit the build and temporary effects.
  isOwner: boolean,
  stateError: string | null,
  onStateChange: PlayChange,
  // The play state after a short or long rest.
  onRested: (state: PlayState) => void,
  // Makes the header portrait clickable, which is otherwise just a picture.
  portrait?: PortraitActions,
}) {
  const { stats, state } = character;
  const identity = stats?.identity;
  const none = <span className="muted">—</span>;
  // Character Info: two rows of three.
  const infoCells: [string, ReactNode][] = [
    ['Level', character.level],
    ['Species', identity?.species ?? none],
    ['Class', identity?.class ?? none],
    ['Subclass', identity?.subclass ?? none],
    ['Background', identity?.background ?? none],
    ['Player', <>{character.owner.name} <span className="muted">@{character.owner.username}</span></>],
  ];
  const play = { state, canEdit, onChange: onStateChange };
  // The one side panel open beside the sheet, if any: opening another replaces it.
  // A feature's or spell's rules text is one of them.
  const [panel, setPanel] = useState<'short' | 'long' | 'conditions' | 'defenses' | SheetInfo | null>(null);
  const info = panel && typeof panel === 'object' ? panel : null;
  const openInfo = info?.id ?? null;
  const infoActions = useMemo(() => ({ openInfo, onInfo: setPanel }), [openInfo]);
  const restProps = { characterId: character.id, state, onRested, onClose: () => setPanel(null) };

  return (
    <SheetInfoContext.Provider value={infoActions}>
    <article className="sheet" data-no-terms aria-label={`${character.name}’s character sheet`}>
      <header className="sheet-header">
        <div className="sheet-box sheet-header__identity">
          <div className="sheet-header__portrait">
            {portrait
              ? <PortraitControl character={character} portrait={portrait} />
              : <CharacterPortrait characterId={character.id} name={character.name} version={character.portraitVersion} size={64} />}
          </div>
          <div className="sheet-header__name">
            <div className="sheet-header__title">
              <h1>{character.name}</h1>
              <span className="sheet-header__campaign">
                {character.campaignId
                  ? <Link to={`/campaign/${character.campaignId}`}>{character.campaignName}</Link>
                  : 'Character Sandbox'}
                {character.isActive && <span className="sheet-badge">Active</span>}
                {character.campaignId && STATUS_LABELS[character.status] && (
                  <span className="sheet-badge sheet-badge--warning">{STATUS_LABELS[character.status]}</span>
                )}
              </span>
            </div>
            {isOwner && (
              <Link to={`/characters/${character.id}/edit`} className="setting-button setting-button--quiet">Edit Character</Link>
            )}
          </div>
        </div>
        <dl className="sheet-box sheet-header__info">
          {infoCells.map(([label, value]) => (
            <div key={label} className="sheet-info">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {panel === 'short' && (
        <ShortRestDialog {...restProps} className={identity?.class ?? null} hitDie={stats?.hitDie ?? null}
          conModifier={character.abilities?.CON?.currentModifier ?? 0} />
      )}
      {panel === 'long' && <LongRestDialog key="long" {...restProps} />}
      {panel === 'defenses' && <DefensesPanel defenses={stats?.defenses ?? null} onClose={() => setPanel(null)} />}
      {panel === 'conditions' && (
        <ConditionsDialog state={state} canEdit={canEdit} onChange={onStateChange} onClose={() => setPanel(null)} />
      )}
      {info && <InfoPanel key={info.id} info={info} onClose={() => setPanel(null)} />}
      {portrait?.error && <p className="setting-error" role="alert">{portrait.error}</p>}

      <div className="sheet-grid">
        {character.abilities
          ? <AbilityBoxes abilities={character.abilities} />
          : <SheetBox area="abilities" title="Ability Scores"><p className="sheet-box__note">Not set yet.</p></SheetBox>}

        <div className={canEdit ? 'sheet-top' : 'sheet-top sheet-top--no-rest'}>
          {canEdit && <>
            <button type="button" className="sheet-box sheet-rest-button sheet-rest-button--short"
              onClick={() => setPanel('short')}>Short Rest</button>
            <button type="button" className="sheet-box sheet-rest-button sheet-rest-button--long"
              onClick={() => setPanel('long')}>Long Rest</button>
          </>}
          {stats && <HeadlineStats stats={stats} />}
          <HitPointsBox {...play} />
          <DefensesConditionsBox {...play} defenses={stats?.defenses ?? null} onOpenConditions={() => setPanel('conditions')}
            onOpenDefenses={() => setPanel('defenses')} />
        </div>

        <div className="sheet-left">
          {stats ? (
            <>
              <div className="sheet-stack">
                <SavingThrowsBox stats={stats} />
                <SensesBox stats={stats} />
                <ProficienciesBox stats={stats} />
              </div>
              <SkillsBox stats={stats} />
            </>
          ) : (
            <SheetBox area="saves" title="Stats"><p className="sheet-box__note">This character was made before the sheet had a build.</p></SheetBox>
          )}
        </div>

        <DetailsPanel character={character} canEdit={canEdit} onChange={onStateChange} error={stateError}
          openInfo={openInfo} onInfo={setPanel} />
      </div>
    </article>
    </SheetInfoContext.Provider>
  );
}
