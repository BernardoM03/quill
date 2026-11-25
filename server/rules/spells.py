# Names of allowed classes that have cantrips on their list but none of them allowed.
# Classes with no cantrips at all (Paladin, Ranger) are fine.
def classes_without_cantrips(spells, classes, allowed_class_ids, allowed_spell_ids):
    allowed_classes = set(allowed_class_ids)
    allowed_spells = set(allowed_spell_ids)
    cantrips = [spell for spell in spells if spell['level'] == 0]
    missing = []
    for cls in classes:
        if cls['id'] not in allowed_classes:
            continue
        class_cantrips = [spell for spell in cantrips if cls['id'] in spell.get('sourceIds', [])]
        if class_cantrips and not any(spell['id'] in allowed_spells for spell in class_cantrips):
            missing.append(cls['name'])
    return missing
