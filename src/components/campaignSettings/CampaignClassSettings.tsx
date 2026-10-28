import { useState } from 'react';

import { useCollection } from '../../packs/usePacks';
import { SectionHeader, type SectionMode } from './SectionHeader';
import { Toggle } from './Toggle';
import { toggleId } from './toggleId';

// View mode: a read-only grid of allowed classes. 
// Edit mode: one row per class with its toggle
export function ClassSettings({ allowedClasses, allowedSubclasses, onClassesChange, onSubclassesChange }: {
  allowedClasses: string[] | null;
  allowedSubclasses: string[] | null;
  onClassesChange: (ids: string[]) => void;
  onSubclassesChange: (ids: string[]) => void;
}) {
  const classes = useCollection('classes');
  const subclasses = useCollection('subclasses');
  const [mode, setMode] = useState<SectionMode>('view');
  // The refused toggle's message, shown inside the class box it came from.
  const [rule, setRule] = useState<{ classId: string; text: string } | null>(null);

  let body;
  if (classes.loading || subclasses.loading) body = <p>Loading…</p>;
  else if (classes.error || subclasses.error) body = <p>Couldn't load classes.</p>;
  else {
    const classList = [...classes.data!.values()];
    const subclassList = [...subclasses.data!.values()];
    const selectedClasses = allowedClasses ?? classList.map(c => c.id);
    const selectedSubclasses = allowedSubclasses ?? subclassList.map(s => s.id);
    const subclassesOf = (classId: string) => subclassList.filter(s => s.classId === classId);
    const allowedClassList = classList.filter(c => selectedClasses.includes(c.id));

    // Characters need a class, and a class with subclasses needs one of them to pick.
    const toggleClass = (classId: string) => {
      const next = toggleId(selectedClasses, classId);
      if (next.length === 0) return setRule({ classId, text: 'At least one class must stay allowed.' });
      setRule(null);
      onClassesChange(next);
      // Turning a class on whose subclasses are all off: turn its subclasses back on too.
      const subs = subclassesOf(classId).map(s => s.id);
      if (next.includes(classId) && subs.length > 0 && !subs.some(id => selectedSubclasses.includes(id))) {
        onSubclassesChange([...selectedSubclasses, ...subs]);
      }
    };

    const toggleSubclass = (classId: string, subclassId: string) => {
      const next = toggleId(selectedSubclasses, subclassId);
      if (!subclassesOf(classId).some(s => next.includes(s.id))) {
        return setRule({ classId, text: 'Each allowed class needs at least one subclass. Turn the class off instead.' });
      }
      setRule(null);
      onSubclassesChange(next);
    };

    if (mode === 'view') body = allowedClassList.length === 0 ? <p className="setting-error">No classes allowed. Characters can't be created until one is.</p> : (
      <div className="toggle-grid-wrap">
        <div className="toggle-grid">
          {allowedClassList.map(cls => (
            <div key={cls.id} className="view-cell">
              <span>{cls.name}</span>
              <span className="view-cell__sub">
                {subclassesOf(cls.id).filter(s => selectedSubclasses.includes(s.id)).map(s => s.name).join(', ') || 'No subclasses (Recommended: Enable at least one)'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
    else body = (
      <div className="class-list">
        {classList.map(cls => {
          const classOn = selectedClasses.includes(cls.id);
          return (
            <div key={cls.id} className="class-cell">
              <Toggle
                label={cls.name}
                checked={classOn}
                onChange={() => toggleClass(cls.id)}
              />
              {classOn && (
                <div className="subclass-grid">
                  {subclassesOf(cls.id).map(sub => (
                    <Toggle
                      key={sub.id}
                      className="subclass-row"
                      label={sub.name}
                      checked={selectedSubclasses.includes(sub.id)}
                      onChange={() => toggleSubclass(cls.id, sub.id)}
                    />
                  ))}
                </div>
              )}
              {rule?.classId === cls.id && <p className="setting-error class-cell__error">{rule.text}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="setting-section">
      <SectionHeader caption="Allowed Classes" mode={mode} onModeChange={setMode} />
      {body}
    </div>
  );
}
