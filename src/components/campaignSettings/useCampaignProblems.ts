import { useCollection } from '../../packs/usePacks';

// Rules a campaign must meet before characters can be made. Returns one message
// per broken rule; empty when the settings are fine (or still loading).
// Ids that no longer exist in any pack don't count as allowed.
export function useCampaignProblems(allowedContent: Record<string, string[] | null> | undefined): string[] {
  const species = useCollection('species');
  const classes = useCollection('classes');
  const subclasses = useCollection('subclasses');

  if (!allowedContent || !species.data || !classes.data || !subclasses.data) return [];

  const allowed = (collection: string, ids: string[]) => {
    const list = allowedContent[collection];
    return list ? ids.filter(id => list.includes(id)) : ids;
  };

  const problems: string[] = [];
  if (allowed('species', [...species.data.keys()]).length === 0) problems.push('No species are allowed.');

  const allowedClasses = allowed('classes', [...classes.data.keys()]);
  if (allowedClasses.length === 0) problems.push('No classes are allowed.');

  const allowedSubclasses = allowed('subclasses', [...subclasses.data.keys()]);
  for (const classId of allowedClasses) {
    const subs = [...subclasses.data.values()].filter(s => s.classId === classId);
    if (subs.length > 0 && !subs.some(s => allowedSubclasses.includes(s.id))) {
      problems.push(`${classes.data.get(classId)!.name} has no allowed subclasses.`);
    }
  }
  return problems;
}
