import './CampaignSettings.css';
import { useReadOnly } from './ReadOnly';

export type SectionMode = 'view' | 'edit';

// A section caption with a View / Edit switch on the right. Read-only pages have no
// switch, and sections start in View, so they stay there.
export function SectionHeader({ caption, mode, onModeChange }: {
  caption: string;
  mode: SectionMode;
  onModeChange: (mode: SectionMode) => void;
}) {
  const readOnly = useReadOnly();
  return (
    <div className="setting-header">
      <span className="setting-caption">{caption}</span>
      {!readOnly && <div className="tabs tabs--small" role="tablist" aria-label={`${caption} mode`}>
        <button type="button" role="tab" aria-selected={mode === 'view'} onClick={() => onModeChange('view')}>View</button>
        <button type="button" role="tab" aria-selected={mode === 'edit'} onClick={() => onModeChange('edit')}>Edit</button>
      </div>}
    </div>
  );
}
