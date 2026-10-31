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

# The refusal a spells change gets when it would leave an allowed class with no
# cantrips, or None. Same message the settings page showed before this moved here.
def spell_change_problem(allowed_content):
    classes = packs.collection('classes')
    spells = packs.collection('spells')
    missing = classes_without_cantrips(
        list(spells.values()), list(classes.values()),
        allowed_ids(allowed_content, 'classes', classes),
        allowed_ids(allowed_content, 'spells', spells),
    )
    if missing:
        return f'{", ".join(missing)} would have no cantrips. Each class needs at least one.'
    return None
