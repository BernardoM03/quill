import { Fragment, useState, type ReactNode } from 'react';

import type { characterSummary, playState, sheetFeature, sheetSpell } from '../../api/characters';
import { useEntry } from '../../packs/usePacks';
import { RulesText } from '../RulesText';
import type { sheetInfo } from './InfoPanel';
import { Pips, type playChange } from './SheetPlay';
import { SheetTerm } from './SheetTerm';
import './Sheet.css';

type tabId = 'actions' | 'spells' | 'inventory' | 'features' | 'background' | 'notes' | 'extras';

const TABS: [tabId, string][] = [
  ['actions', 'Actions'], ['spells', 'Spells'], ['inventory', 'Inventory'], ['features', 'Features'],
  ['background', 'Background'], ['notes', 'Notes'], ['extras', 'Extras'],
];

const ORDINALS = ['Cantrips', '1st Level', '2nd Level', '3rd Level', '4th Level', '5th Level', '6th Level', '7th Level', '8th Level', '9th Level'];
const RECHARGE: Record<string, string> = { long: 'Long Rest', short: 'Short Rest', dawn: 'Dawn', none: 'Never' };
const ACTIVATION: Record<string, string> = {
  action: 'Action', bonusAction: 'Bonus Action', reaction: 'Reaction', free: 'Free', special: 'Special', passive: 'Passive',
};
// The actions any character can take in combat (SRD 5.2, Actions).
const COMBAT_ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize'];

const signed = (n: number | null | undefined) => (n == null ? '—' : n >= 0 ? `+${n}` : `${n}`);

// A row of filter chips; the first is "All".
function Filters<T extends string>({ options, value, onChange }: { options: [T, string][], value: T, onChange: (v: T) => void }) {
  return (
    <div className="details-filters" role="group" aria-label="Filter">
      {options.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={value === id}
          className={`details-chip${value === id ? ' details-chip--on' : ''}`} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

function Section({ title, aside, children }: { title: string, aside?: ReactNode, children: ReactNode }) {
  return (
    <section className="details-section">
      <h3 className="details-section__title">{title}{aside && <span className="details-section__aside">{aside}</span>}</h3>
      {children}
    </section>
  );
}

// How many uses of a limited-use feature are left: boxes to tick (ticked = spent) for a few,
// or − / + with the number left for a pool (Lay On Hands).
function Uses({ feature, state, canEdit, onChange }: {
  feature: sheetFeature, state: playState, canEdit: boolean, onChange: playChange,
}) {
  const uses = feature.uses!;
  const spent = state.featureUses[feature.id] ?? 0;
  const set = (n: number) => {
    const featureUses = { ...state.featureUses, [feature.id]: n };
    onChange({ featureUses }, { featureUses: { [feature.id]: n } });
  };
  const recharge = RECHARGE[uses.recharge ?? ''] ?? uses.recharge;
  return (
    <div className="details-uses">
      {uses.pool || uses.max > 10 ? (
        <span className="details-uses__pool">
          {canEdit && <button type="button" className="sheet-step" aria-label={`Spend 1 ${feature.name}`} disabled={spent >= uses.max} onClick={() => set(spent + 1)}>−</button>}
          <span><strong>{uses.max - spent}</strong> / {uses.max}</span>
          {canEdit && <button type="button" className="sheet-step" aria-label={`Regain 1 ${feature.name}`} disabled={spent <= 0} onClick={() => set(spent - 1)}>+</button>}
        </span>
      ) : (
        <Pips label={`${feature.name} uses spent`} total={uses.max} filled={spent} disabled={!canEdit} onChange={set} />
      )}
      {recharge && (
        <span className="details-uses__recharge">
          {recharge}{uses.shortRecover ? ` (Short Rest: +${uses.shortRecover})` : ''}
        </span>
      )}
    </div>
  );
}

// A name that opens its rules text in the panel beside the sheet; clicking the one that's
// open closes it.
function InfoButton({ info, openInfo, onInfo }: { info: sheetInfo } & infoProps) {
  const open = openInfo === info.id;
  return (
    <button type="button" className={`details-feature__name${open ? ' details-feature__name--on' : ''}`}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => onInfo(open ? null : info)}>{info.title}</button>
  );
}

// One feature: its name (opens its rules text beside the sheet), where it's from, any uses.
function FeatureEntry({ feature, state, canEdit, onChange, meta, ...info }: {
  feature: sheetFeature, state: playState, canEdit: boolean, onChange: playChange, meta?: string,
} & infoProps) {
  return (
    <li className="details-feature">
      <div className="details-feature__head">
        <InfoButton {...info} info={{ id: feature.id, title: feature.name, meta, text: feature.description ?? '' }} />
        {meta && <span className="details-feature__meta">{meta}</span>}
      </div>
      {feature.uses && <Uses feature={feature} state={state} canEdit={canEdit} onChange={onChange} />}
    </li>
  );
}

function sourceLabel(f: sheetFeature): string {
  if (f.source === 'species') return 'Species trait';
  if (f.source === 'feat') return 'Origin feat';
  return `${f.source === 'subclass' ? 'Subclass' : 'Class'} · Level ${f.level ?? 1}`;
}

type actionFilter = 'all' | 'action' | 'bonusAction' | 'reaction' | 'other' | 'limited';

function ActionsTab({ character, canEdit, onChange, openInfo, onInfo }: tabProps) {
  const [filter, setFilter] = useState<actionFilter>('all');
  const { state } = character;
  const actionable = character.features.filter(f => f.activation !== 'passive' || f.uses);
  const shown = actionable.filter(f =>
    filter === 'all' ? true :
    filter === 'limited' ? !!f.uses :
    filter === 'other' ? !['action', 'bonusAction', 'reaction'].includes(f.activation) :
    f.activation === filter);
  const str = character.abilities?.STR?.currentModifier ?? null;
  const prof = character.stats?.proficiencyBonus ?? null;
  const showDeathSaves = state.currentHp === 0 || state.deathSaves.successes > 0 || state.deathSaves.failures > 0;
  const setDeathSaves = (d: playState['deathSaves']) => onChange({ deathSaves: d }, { deathSaves: d });

  return (
    <>
      {showDeathSaves && (
        <Section title="Death Saves">
          <div className="details-death">
            <span>Successes <Pips label="Death save successes" total={3} filled={state.deathSaves.successes} disabled={!canEdit} tone="good"
              onChange={successes => setDeathSaves({ ...state.deathSaves, successes })} /></span>
            <span>Failures <Pips label="Death save failures" total={3} filled={state.deathSaves.failures} disabled={!canEdit} tone="danger"
              onChange={failures => setDeathSaves({ ...state.deathSaves, failures })} /></span>
          </div>
        </Section>
      )}
      <Filters<actionFilter> value={filter} onChange={setFilter} options={[
        ['all', 'All'], ['action', 'Action'], ['bonusAction', 'Bonus Action'], ['reaction', 'Reaction'], ['other', 'Other'], ['limited', 'Limited Use'],
      ]} />
      {(filter === 'all' || filter === 'action') && (
        <Section title="Attacks">
          <table className="details-table">
            <thead><tr><th>Attack</th><th>Range</th><th>Hit</th><th>Damage</th></tr></thead>
            <tbody>
              <tr>
                <td><strong><SheetTerm term="Unarmed Strike">Unarmed Strike</SheetTerm></strong><span className="details-table__sub">Melee attack</span></td>
                <td>5 ft</td>
                <td className="details-table__num">{signed(str != null && prof != null ? str + prof : null)}</td>
                <td className="details-table__num">{str != null ? `${Math.max(1, 1 + str)} Bludgeoning` : '—'}</td>
              </tr>
            </tbody>
          </table>
          <p className="details-empty">Weapon attacks will appear here once inventory is tracked.</p>
        </Section>
      )}
      {shown.length > 0 && (
        <Section title="Features">
          <ul className="details-features">
            {shown.map(f => (
              <FeatureEntry key={f.id} feature={f} state={state} canEdit={canEdit} onChange={onChange}
                meta={ACTIVATION[f.activation]} openInfo={openInfo} onInfo={onInfo} />
            ))}
          </ul>
        </Section>
      )}
      {(filter === 'all' || filter === 'action') && (
        <Section title="Actions in Combat">
          <p className="details-combat">
            {COMBAT_ACTIONS.map((action, i) => (
              <Fragment key={action}>{i > 0 && ', '}<SheetTerm term={action}>{action}</SheetTerm></Fragment>
            ))}
          </p>
        </Section>
      )}
      {shown.length === 0 && filter !== 'all' && filter !== 'action' && <p className="details-empty">Nothing here for this character.</p>}
    </>
  );
}

function SpellsTab({ character, canEdit, onChange, openInfo, onInfo }: tabProps) {
  const { state, spells } = character;
  const casting = character.stats?.spellcasting;
  const slotLevels = Object.keys(state.spellSlots).sort();
  const levels = [...new Set(spells.map(s => s.level))].sort((a, b) => a - b);
  const [filter, setFilter] = useState<string>('all');
  const setSlot = (level: string, spent: number) => onChange(
    { spellSlots: { ...state.spellSlots, [level]: { ...state.spellSlots[level], spent } } }, { spentSlots: { [level]: spent } });

  if (!casting && spells.length === 0 && slotLevels.length === 0 && !state.pactSlots) {
    return <p className="details-empty">This character doesn’t cast spells.</p>;
  }
  return (
    <>
      {casting && (
        <p className="details-casting">
          Spellcasting ability <strong>{casting.ability}</strong> · Save DC <strong>{casting.saveDc ?? '—'}</strong> · Attack <strong>{signed(casting.attackBonus)}</strong>
        </p>
      )}
      {(slotLevels.length > 0 || state.pactSlots) && (
        <Section title="Spell Slots" aside="ticked: used">
          <div className="details-slots">
            {slotLevels.map(level => (
              <span key={level} className="details-slots__row">
                <span className="details-slots__level">{ORDINALS[Number(level)].replace(' Level', '')}</span>
                <Pips label={`Level ${level} slots used`} total={state.spellSlots[level].total} filled={state.spellSlots[level].spent}
                  disabled={!canEdit} onChange={spent => setSlot(level, spent)} />
              </span>
            ))}
            {state.pactSlots && (
              <span className="details-slots__row">
                <span className="details-slots__level">Pact ({ORDINALS[state.pactSlots.slotLevel].replace(' Level', '')})</span>
                <Pips label="Pact slots used" total={state.pactSlots.total} filled={state.pactSlots.spent} disabled={!canEdit}
                  onChange={spent => onChange({ pactSlots: { ...state.pactSlots!, spent } }, { spentPactSlots: spent })} />
              </span>
            )}
          </div>
        </Section>
      )}
      {spells.length > 0 && (
        <Filters value={filter} onChange={setFilter}
          options={[['all', 'All'], ...levels.map(l => [String(l), l === 0 ? 'Cantrips' : ORDINALS[l].replace(' Level', '')] as [string, string])]} />
      )}
      {levels.filter(l => filter === 'all' || String(l) === filter).map(level => (
        <Section key={level} title={ORDINALS[level]}>
          <SpellTable spells={spells.filter(s => s.level === level)} openInfo={openInfo} onInfo={onInfo} />
        </Section>
      ))}
      {spells.length === 0 && <p className="details-empty">Spells picked in the Character Wizard will appear here.</p>}
    </>
  );
}

// "1st Level · Evocation · Concentration", then how it's cast: the line under a spell's name
// in the panel beside the sheet.
function spellMeta(s: sheetSpell, tags: string): string {
  return [ORDINALS[s.level]?.replace('Cantrips', 'Cantrip'), tags, s.castingTime, s.range, s.duration].filter(Boolean).join(' · ');
}

function SpellTable({ spells, ...info }: { spells: sheetSpell[] } & infoProps) {
  return (
    <table className="details-table details-table--spells">
      <thead><tr><th>Name</th><th>Time</th><th>Range</th><th>Duration</th></tr></thead>
      <tbody>
        {spells.map(s => {
          const tags = [s.school && s.school[0].toUpperCase() + s.school.slice(1), s.concentration && 'Concentration', s.ritual && 'Ritual']
            .filter(Boolean).join(' · ');
          return (
            <tr key={s.id}>
              <td>
                <InfoButton {...info} info={{ id: s.id, title: s.name, meta: spellMeta(s, tags), text: s.description ?? '' }} />
                <span className="details-table__sub">{tags}</span>
              </td>
              <td>{s.castingTime ?? '—'}</td>
              <td>{s.range ?? '—'}</td>
              <td>{s.duration ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type featureFilter = 'all' | 'class' | 'species' | 'feat';

function FeaturesTab({ character, canEdit, onChange, openInfo, onInfo }: tabProps) {
  const [filter, setFilter] = useState<featureFilter>('all');
  const groups: [featureFilter, string, sheetFeature[]][] = [
    ['class', 'Class Features', character.features.filter(f => f.source === 'class' || f.source === 'subclass')],
    ['species', 'Species Traits', character.features.filter(f => f.source === 'species')],
    ['feat', 'Feats', character.features.filter(f => f.source === 'feat')],
  ];
  return (
    <>
      <Filters<featureFilter> value={filter} onChange={setFilter}
        options={[['all', 'All'], ['class', 'Class Features'], ['species', 'Species Traits'], ['feat', 'Feats']]} />
      {groups.filter(([id]) => filter === 'all' || filter === id).map(([id, title, list]) => (
        <Section key={id} title={title}>
          {list.length === 0 ? <p className="details-empty">None.</p> : (
            <ul className="details-features">
              {list.map(f => <FeatureEntry key={f.id} feature={f} state={character.state} canEdit={canEdit} onChange={onChange} meta={sourceLabel(f)}
                openInfo={openInfo} onInfo={onInfo} />)}
            </ul>
          )}
        </Section>
      ))}
    </>
  );
}

const CHARACTERISTICS: [string, string][] = [
  ['alignment', 'Alignment'], ['gender', 'Gender'], ['eyes', 'Eyes'], ['height', 'Height'], ['faith', 'Faith'],
  ['hair', 'Hair'], ['skin', 'Skin'], ['age', 'Age'], ['weight', 'Weight'], ['lifestyle', 'Lifestyle'],
];

function detailText(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

// A block of the character's own writing, or a muted line saying where to add it.
function Writing({ text, empty }: { text: string, empty: string }) {
  return text ? <p className="details-writing">{text}</p> : <p className="details-empty">{empty}</p>;
}

function BackgroundTab({ character }: tabProps) {
  const details = (character.draft.details ?? {}) as Record<string, unknown>;
  const backgroundId = typeof character.draft.background === 'string' ? character.draft.background : '';
  const { entry: background } = useEntry('origins', backgroundId);
  const [filter, setFilter] = useState<'all' | 'background' | 'characteristics' | 'appearance'>('all');
  const add = 'None yet.';
  return (
    <>
      <Filters value={filter} onChange={setFilter}
        options={[['all', 'All'], ['background', 'Background'], ['characteristics', 'Characteristics'], ['appearance', 'Appearance']]} />
      {(filter === 'all' || filter === 'background') && (
        <Section title={background?.name ? `Background: ${background.name}` : 'Background'}>
          {background?.description ? <RulesText>{background.description}</RulesText> : <p className="details-empty">No background picked.</p>}
        </Section>
      )}
      {(filter === 'all' || filter === 'characteristics') && (
        <Section title="Characteristics">
          <dl className="details-grid">
            {CHARACTERISTICS.map(([key, label]) => (
              <div key={key}><dt>{label}</dt><dd>{detailText(details, key) || <span className="muted">—</span>}</dd></div>
            ))}
          </dl>
          {([['personalityTraits', 'Personality Traits'], ['ideals', 'Ideals'], ['bonds', 'Bonds'], ['flaws', 'Flaws']] as const).map(([key, label]) => (
            <div key={key} className="details-sub">
              <h4>{label}</h4>
              <Writing text={detailText(details, key)} empty={add} />
            </div>
          ))}
        </Section>
      )}
      {(filter === 'all' || filter === 'appearance') && (
        <Section title="Appearance"><Writing text={detailText(details, 'appearance')} empty={add} /></Section>
      )}
    </>
  );
}

function NotesTab({ character }: tabProps) {
  const details = (character.draft.details ?? {}) as Record<string, unknown>;
  const sections: [string, string][] = [
    ['organizations', 'Organizations'], ['allies', 'Allies'], ['enemies', 'Enemies'], ['backstory', 'Backstory'], ['other', 'Other'],
  ];
  const [filter, setFilter] = useState('all');
  return (
    <>
      <Filters value={filter} onChange={setFilter}
        options={[['all', 'All'], ['organizations', 'Orgs'], ['allies', 'Allies'], ['enemies', 'Enemies'], ['backstory', 'Backstory'], ['other', 'Other']]} />
      {sections.filter(([key]) => filter === 'all' || filter === key).map(([key, title]) => (
        <Section key={key} title={title}>
          <Writing text={detailText(details, key)} empty="None yet." />
        </Section>
      ))}
      {character.notes != null && (filter === 'all' || filter === 'other') && (
        <Section title="Private Notes" aside="only you see these">
          <Writing text={character.notes} empty="None yet." />
        </Section>
      )}
    </>
  );
}

interface infoProps {
  // The id of the feature or spell whose text is open beside the sheet, if one is.
  openInfo: string | null,
  // Open that text beside the sheet; null closes it.
  onInfo: (info: sheetInfo | null) => void,
}

interface tabProps extends infoProps {
  character: characterSummary,
  canEdit: boolean,
  onChange: playChange,
}

// The sheet's Details panel: the character's actions, spells, features, background and notes,
// a tab each. A feature's or spell's rules text opens beside the sheet rather than in the
// list. Limited-use features and spell slots are tracked here; inventory and extras will be
// once they're stored.
export function DetailsPanel({ error, ...props }: tabProps & { error: string | null }) {
  const [tab, setTab] = useState<tabId>('actions');
  const body: Record<tabId, ReactNode> = {
    actions: <ActionsTab {...props} />,
    spells: <SpellsTab {...props} />,
    inventory: <p className="details-empty details-empty--center">Inventory isn’t tracked yet. Equipment and coins will show here.</p>,
    features: <FeaturesTab {...props} />,
    background: <BackgroundTab {...props} />,
    notes: <NotesTab {...props} />,
    extras: <p className="details-empty details-empty--center">Extras that you add will show here.</p>,
  };
  return (
    <section className="sheet-box sheet-box--details details" aria-label="Details">
      <div className="details-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`details-tab-${id}`} aria-selected={tab === id} aria-controls="details-body"
            className={`details-tab${tab === id ? ' details-tab--on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="details-body" id="details-body" role="tabpanel" aria-labelledby={`details-tab-${tab}`}>
        {body[tab]}
      </div>
      {error && <p className="setting-error details-error" role="alert">{error}</p>}
    </section>
  );
}
