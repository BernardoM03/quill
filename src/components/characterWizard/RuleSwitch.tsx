// One rule's options side by side, with options outside allowed greyed out.
export function RuleSwitch<T extends string>({ label, options, value, allowed, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  // Every option is allowed when omitted.
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
