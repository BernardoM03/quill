import './CampaignSettings.css';

// A label with a thin rectangular switch on the right. The real checkbox stays in
// the page (just unseen) so keyboard and screen readers still work. hint is an
// optional muted line under the label.
export function Toggle({ label, hint, checked, onChange, className = '' }: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
  className?: string;
}) {
  return (
    <label className={`setting-row toggle-row ${className}`}>
      {hint ? (
        <span className="setting-label">
          <span title={label}>{label}</span>
          <span className="setting-hint">{hint}</span>
        </span>
      ) : (
        <span title={label}>{label}</span>
      )}
      <input
        type="checkbox"
        role="switch"
        className="toggle-input"
        checked={checked}
        onChange={onChange}
      />
      <span className="toggle" aria-hidden="true" />
    </label>
  );
}
