# Rules a campaign must meet before characters can be made, ported from
# src/components/campaignSettings/useCampaignProblems.ts.

from server.rules import packs
from server.rules.spells import classes_without_cantrips

# The ids of a collection the campaign allows. A missing or null list means everything;
# ids that no longer exist in any pack don't count as allowed. Keeps pack order.
def allowed_ids(allowed_content, collection, entries):
    chosen = allowed_content.get(collection)
    if chosen is None:
        return list(entries)
    chosen = set(chosen)
    return [entry_id for entry_id in entries if entry_id in chosen]

# One message per broken rule; empty when the settings are fine.
def campaign_problems(allowed_content):
    species = packs.collection('species')
    classes = packs.collection('classes')
    subclasses = packs.collection('subclasses')
    spells = packs.collection('spells')

    problems = []
    if not allowed_ids(allowed_content, 'species', species):
        problems.append('No species are allowed.')

    allowed_classes = allowed_ids(allowed_content, 'classes', classes)
    if not allowed_classes:
        problems.append('No classes are allowed.')

    allowed_subclasses = set(allowed_ids(allowed_content, 'subclasses', subclasses))
    for class_id in allowed_classes:
        subs = [s for s in subclasses.values() if s.get('classId') == class_id]
        if subs and not any(s['id'] in allowed_subclasses for s in subs):
            problems.append(f'{classes[class_id]["name"]} has no allowed subclasses.')

    allowed_spells = allowed_ids(allowed_content, 'spells', spells)
    for name in classes_without_cantrips(list(spells.values()), list(classes.values()), allowed_classes, allowed_spells):
        problems.append(f'{name} has no allowed cantrips.')
    return problems

# Ids of allowed classes that have subclasses but none of them allowed.
def classes_without_subclasses(allowed_content):
    subclasses = packs.collection('subclasses')
    allowed_subclasses = set(allowed_ids(allowed_content, 'subclasses', subclasses))
    broken = []
    for class_id in allowed_ids(allowed_content, 'classes', packs.collection('classes')):
        subs = [s['id'] for s in subclasses.values() if s.get('classId') == class_id]
        if subs and not any(s in allowed_subclasses for s in subs):
            broken.append(class_id)
    return broken

# The refusal a classes or subclasses change gets when it leaves a class that was fine
# with no allowed subclass, or None. Classes that were already broken don't count, so a
# GM fixing an old campaign one class at a time isn't blocked by the classes left to fix.
# Turning a class on must include its subclasses in the same change.
def subclass_change_problem(before, after):
    already = set(classes_without_subclasses(before))
    newly = [c for c in classes_without_subclasses(after) if c not in already]
    if not newly:
        return None
    classes = packs.collection('classes')
    names = ', '.join(classes[c]['name'] for c in newly)
    return f'{names} would have no subclasses. Each allowed class needs at least one; turn the class off instead.'

def _without_cantrips(allowed_content):
    classes = packs.collection('classes')
    spells = packs.collection('spells')
    return classes_without_cantrips(
        list(spells.values()), list(classes.values()),
        allowed_ids(allowed_content, 'classes', classes),
        allowed_ids(allowed_content, 'spells', spells),
    )

# The refusal a spells change gets when it leaves a class that had a cantrip with none,
# or None. Like subclass_change_problem, classes already without one don't count, so
# an old campaign missing cantrips for two classes can be fixed one class at a time.
def spell_change_problem(before, after):
    already = set(_without_cantrips(before))
    newly = [name for name in _without_cantrips(after) if name not in already]
    if newly:
        return f'{", ".join(newly)} would have no cantrips. Each class needs at least one.'
    return None
