from server.rules import packs
from server.rules.spells import classes_without_cantrips

# Rules a campaign's settings must meet before characters can be made.

# Allowed ids of a collection in pack order, where a missing or null list allows everything.
# Ids no longer in any pack don't count as allowed.
def allowed_ids(allowed_content, collection, entries):
    chosen = allowed_content.get(collection)
    if chosen is None:
        return list(entries)
    chosen = set(chosen)
    return [entry_id for entry_id in entries if entry_id in chosen]

# Ids of allowed classes that have subclasses but none of them allowed.
def classes_without_subclasses(allowed_content):
    subclasses = packs.collection('subclasses')
    allowed_subclasses = set(allowed_ids(allowed_content, 'subclasses', subclasses))
    missing = []
    for class_id in allowed_ids(allowed_content, 'classes', packs.collection('classes')):
        class_subclasses = [subclass['id'] for subclass in subclasses.values() if subclass.get('classId') == class_id]
        if class_subclasses and not any(subclass_id in allowed_subclasses for subclass_id in class_subclasses):
            missing.append(class_id)
    return missing

def _classes_without_cantrips(allowed_content):
    classes = packs.collection('classes')
    spells = packs.collection('spells')
    return classes_without_cantrips(
        list(spells.values()), list(classes.values()),
        allowed_ids(allowed_content, 'classes', classes),
        allowed_ids(allowed_content, 'spells', spells),
    )

# One message per broken rule; empty when the settings are fine.
def campaign_problems(allowed_content):
    classes = packs.collection('classes')
    problems = []
    if not allowed_ids(allowed_content, 'species', packs.collection('species')):
        problems.append('No species are allowed.')
    if not allowed_ids(allowed_content, 'origins', packs.collection('origins')):
        problems.append('No backgrounds are allowed.')
    if not allowed_ids(allowed_content, 'classes', classes):
        problems.append('No classes are allowed.')
    for class_id in classes_without_subclasses(allowed_content):
        problems.append(f'{classes[class_id]["name"]} has no allowed subclasses.')
    for class_name in _classes_without_cantrips(allowed_content):
        problems.append(f'{class_name} has no allowed cantrips.')
    return problems

# The refusal for a classes or subclasses change that leaves a previously fine class without subclasses, or None.
# Already-broken classes don't count, so an old campaign can be fixed one class at a time.
def subclass_change_problem(before, after):
    already_missing = set(classes_without_subclasses(before))
    newly_missing = [class_id for class_id in classes_without_subclasses(after) if class_id not in already_missing]
    if not newly_missing:
        return None
    classes = packs.collection('classes')
    names = ', '.join(classes[class_id]['name'] for class_id in newly_missing)
    return f'{names} would have no subclasses. Each allowed class needs at least one; turn the class off instead.'

# The refusal for a spells change that leaves a previously fine class without cantrips, or None.
def spell_change_problem(before, after):
    already_missing = set(_classes_without_cantrips(before))
    newly_missing = [name for name in _classes_without_cantrips(after) if name not in already_missing]
    if newly_missing:
        return f'{", ".join(newly_missing)} would have no cantrips. Each class needs at least one.'
    return None
