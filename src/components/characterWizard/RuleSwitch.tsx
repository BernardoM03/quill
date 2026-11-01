// One rule's options side by side, every option shown. In a campaign the GM has chosen
// (locked), the others are greyed out; in the Character Sandbox the player picks.
export function RuleSwitch<T extends string>({ label, options, value, allowed, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  // The options that may be picked; every one when omitted.
  allowed?: T[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="rule-switch">
      <span className="setting-caption">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
            disabled={o.value !== value && allowed !== undefined && !allowed.includes(o.value)}
            onClick={() => o.value !== value && onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
