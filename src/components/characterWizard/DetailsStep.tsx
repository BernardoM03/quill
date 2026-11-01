import { CHARACTER_NAME_MAX_LENGTH, type characterDetails } from '../../api/characters';

const SHORT_MAX = 100;
const LONG_MAX = 5000;
const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];

type detailKey = keyof characterDetails;

// The last step: the character's name and description, every part but the name optional.
// The server checks the same limits (server/rules/details.py).
// errorsFor(field): the server's messages for 'name' and 'details:<key>'.
export function DetailsStep({ name, details, onName, onDetail, errorsFor }: {
  name: string;
  details: characterDetails;
  onName: (name: string) => void;
  onDetail: (key: detailKey, value: string) => void;
  errorsFor: (field: string) => string[];
}) {
  const errors = (field: string) => errorsFor(field).map(m => <p key={m} className="campaign-name__error">{m}</p>);

  const short = (key: detailKey, label: string, placeholder?: string) => (
    <label key={key} className="details-field">
      <span className="setting-caption">{label}</span>
      <input className="details-input" value={details[key] ?? ''} maxLength={SHORT_MAX} placeholder={placeholder}
        onChange={e => onDetail(key, e.target.value)} />
      {errors(`details:${key}`)}
    </label>
  );
  const long = (key: detailKey, label: string, placeholder?: string) => (
    <label key={key} className="details-field details-field--wide">
      <span className="setting-caption">{label}</span>
      <textarea className="details-textarea" value={details[key] ?? ''} maxLength={LONG_MAX} placeholder={placeholder}
        rows={3} onChange={e => onDetail(key, e.target.value)} />
      {errors(`details:${key}`)}
    </label>
  );

  return (
    <div className="pick-card details-step">
      <h3 className="pick-card__section-title">Character Details</h3>
      <div className="details-grid">
        <label className="details-field details-field--wide">
          <span className="setting-caption">Character Name</span>
          <input className="campaign-name__input" aria-label="Character name" value={name}
            maxLength={CHARACTER_NAME_MAX_LENGTH} autoFocus onChange={e => onName(e.target.value)} />
          {errors('name')}
        </label>
        <label className="details-field">
          <span className="setting-caption">Alignment</span>
          <select className="rules-select" value={details.alignment ?? ''} onChange={e => onDetail('alignment', e.target.value)}>
            <option value="">—</option>
            {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {errors('details:alignment')}
        </label>
        {short('faith', 'Faith')}
        {short('lifestyle', 'Lifestyle', 'Modest, Comfortable, …')}
      </div>

      <h3 className="pick-card__section-title">Physical Characteristics</h3>
      <div className="details-grid">
        {short('gender', 'Gender')}
        {short('age', 'Age')}
        {short('height', 'Height')}
        {short('weight', 'Weight')}
        {short('hair', 'Hair')}
        {short('eyes', 'Eyes')}
        {short('skin', 'Skin')}
        {long('appearance', 'Appearance', 'Anything else about how they look.')}
      </div>

      <h3 className="pick-card__section-title">Personal Characteristics</h3>
      <div className="details-grid">
        {long('personalityTraits', 'Personality Traits')}
        {long('ideals', 'Ideals')}
        {long('bonds', 'Bonds')}
        {long('flaws', 'Flaws')}
      </div>

      <h3 className="pick-card__section-title">Notes</h3>
      <div className="details-grid">
        {long('organizations', 'Organizations')}
        {long('allies', 'Allies')}
        {long('enemies', 'Enemies')}
        {long('backstory', 'Backstory')}
        {long('other', 'Other')}
      </div>
      {errors('details')}
    </div>
  );
}
