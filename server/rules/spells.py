# Spell rules. (The short class labels on spell toggles, "Wa" / "Wi", are display only and
# stay in the browser: src/components/campaignSettings/spellRules.ts.)

# Names of allowed classes that have cantrips on their list but none of them allowed.
# A class with no cantrips at all (Paladin, Ranger) is fine.
def classes_without_cantrips(spells, classes, allowed_class_ids, allowed_spell_ids):
    allowed_classes = set(allowed_class_ids)
    allowed_spells = set(allowed_spell_ids)
    cantrips = [s for s in spells if s['level'] == 0]
    missing = []
    for c in classes:
        if c['id'] not in allowed_classes:
            continue
        own = [s for s in cantrips if c['id'] in s.get('sourceIds', [])]
        if own and not any(s['id'] in allowed_spells for s in own):
            missing.append(c['name'])
    return missing
