import './CampaignSettings.css';

// A label with a thin rectangular switch on the right. The real checkbox stays in
// the page (just unseen) so keyboard and screen readers still work.
export function Toggle({ label, checked, onChange, className = '' }: {
  label: string;
  checked: boolean;
  onChange: () => void;
  className?: string;
}) {
  return (
    <label className={`setting-row toggle-row ${className}`}>
      <span>{label}</span>
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
