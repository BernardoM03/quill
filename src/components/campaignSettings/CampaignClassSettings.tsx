import { useCollection } from '../../packs/usePacks';
import { Toggle } from './Toggle';
import { toggleId } from './toggleId';

// One row per class: the class toggle, then (while it's on) its subclasses in columns below.
// allowedClasses / allowedSubclasses are the saved ids, or null for "all".
export function ClassSettings({ allowedClasses, allowedSubclasses, onClassesChange, onSubclassesChange }: {
  allowedClasses: string[] | null;
  allowedSubclasses: string[] | null;
  onClassesChange: (ids: string[]) => void;
  onSubclassesChange: (ids: string[]) => void;
}) {
  const classes = useCollection('classes');
  const subclasses = useCollection('subclasses');

  let body;
  if (classes.loading || subclasses.loading) body = <p>Loading…</p>;
  else if (classes.error || subclasses.error) body = <p>Couldn't load classes.</p>;
  else {
    const classList = [...classes.data!.values()];
    const subclassList = [...subclasses.data!.values()];
    const selectedClasses = allowedClasses ?? classList.map(c => c.id);
    const selectedSubclasses = allowedSubclasses ?? subclassList.map(s => s.id);

    body = (
      <div className="class-list">
        {classList.map(cls => {
          const classOn = selectedClasses.includes(cls.id);
          return (
            <div key={cls.id} className="class-cell">
              <Toggle
                label={cls.name}
                checked={classOn}
                onChange={() => onClassesChange(toggleId(selectedClasses, cls.id))}
              />
              {classOn && (
                <div className="subclass-grid">
                  {subclassList.filter(s => s.classId === cls.id).map(sub => (
                    <Toggle
                      key={sub.id}
                      className="subclass-row"
                      label={sub.name}
                      checked={selectedSubclasses.includes(sub.id)}
                      onChange={() => onSubclassesChange(toggleId(selectedSubclasses, sub.id))}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="setting-section">
      <span className="setting-caption">Allowed Classes</span>
      {body}
    </div>
  );
}
