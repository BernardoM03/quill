# Turning a pack "choice" into options a player can pick from, shared by species, classes
# and subclasses. A choice names its options in one of these ways:
#   from: [...]             a literal list: abilities, sizes, ids, or {value, label} pairs
#   from: "<pack>:list/x"   a named list, defined by a feature's options.items
#   from: "<pack>:class/x"  that class's spell list
#   fromTypes: [...]        every entry of a kind (skill, feat, equipment, spell, ...)
# and qualifiers narrow the options (feat category, spell level, weapon, beast up to a CR, ...).
# Options that point at other content only include what the campaign allows.

import re

from server.rules import packs
from server.rules.problems import allowed_ids

ABILITY_NAMES = {
    'STR': 'Strength', 'DEX': 'Dexterity', 'CON': 'Constitution',
    'INT': 'Intelligence', 'WIS': 'Wisdom', 'CHA': 'Charisma',
}
SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
# The middle part of a pack id ("srd-5.2:skill/insight") and the collection it lives in.
ID_TYPES = {
    'skill': 'skills', 'feat': 'feats', 'tool': 'tools', 'language': 'languages', 'spell': 'spells',
    'species': 'species', 'class': 'classes', 'subclass': 'subclasses', 'equipment': 'equipment',
    'creature': 'creatures',
}

def _entity_type(entry_id):
    # "srd-5.2:skill/insight" -> "skill"
    return entry_id.split(':', 1)[1].split('/', 1)[0] if isinstance(entry_id, str) and ':' in entry_id else None

def allowed_entries(collection, allowed_content):
    entries = packs.collection(collection)
    if allowed_content is None:
        return list(entries.values())
    return [entries[i] for i in allowed_ids(allowed_content, collection, entries)]

def option(key, label, description=None, grants=None):
    result = {'key': key, 'label': label}
    if description:
        result['description'] = description
    if grants:
        result['grants'] = grants
    return result

# Everything a qualifier needs to know about the character being built.
class Context:
    def __init__(self, allowed_content, level=1, column=None, features=None, lists=None,
                 feat_prerequisites=True, spellcasting=False, weapon_proficiencies=()):
        self.allowed_content = allowed_content
        self.level = level
        # The campaign's "Feat Prerequisites" rule: when off, any feat can be picked.
        self.feat_prerequisites = feat_prerequisites
        # Whether the class being built has the Spellcasting feature (a feat prerequisite).
        self.spellcasting = spellcasting
        # The class's weaponProficiencies items: "simpleWeapons", or {category, withProperties}.
        self.weapon_proficiencies = weapon_proficiencies
        # column(name) -> the class table's value at this level, e.g. wildShapeMaxCr.
        self.column = column or (lambda name: None)
        # Feature id -> feature, for {value, label, grants} options.
        self.features = features or {}
        # List id -> items, for from: "<pack>:list/x".
        self.lists = lists or {}

def _number(value, context):
    if isinstance(value, str) and value.startswith('$column:'):
        return context.column(value[len('$column:'):])
    return value

def _passes(entry, qualifier, context):
    kind = qualifier.get('type')
    if kind == 'featCategory':
        result = entry.get('category') in qualifier.get('featCategories', [])
    elif kind == 'spellLevel':
        result = entry.get('level') in qualifier.get('spellLevels', [])
    elif kind == 'spellSchool':
        result = entry.get('school') in qualifier.get('schools', [])
    elif kind == 'spellSource':
        result = qualifier.get('sourceId') in (entry.get('sourceIds') or [])
    elif kind == 'equipment':
        result = entry.get('category') in qualifier.get('equipment', [])
    elif kind == 'attackRange':
        result = entry.get('attackRange') in qualifier.get('attackRanges', [])
    elif kind == 'creatureType':
        result = entry.get('creatureType') in qualifier.get('creatureTypes', [])
    elif kind == 'challengeRating':
        limit = _number(qualifier.get('atMost'), context)
        result = limit is None or (entry.get('challengeRating') is not None and entry['challengeRating'] <= limit)
    elif kind == 'hasSpeed':
        result = any(s in (entry.get('speed') or {}) for s in qualifier.get('speeds', []))
    elif kind == 'classLevel':
        result = context.level >= qualifier.get('atLeast', 0)
    elif kind == 'anyOf':
        result = any(_passes(entry, q, context) for q in qualifier.get('qualifiers', []))
    elif kind == 'proficient' and entry.get('category') == 'weapon':
        result = proficient_with_weapon(entry, context.weapon_proficiencies)
    else:
        # 'proficient' on skills is checked against the draft when validating (see
        # proficient_only); anything else unknown doesn't narrow the options.
        result = True
    return not result if qualifier.get('negate') else result

# Whether the character meets a feat's prerequisites. Ability-score prerequisites count as
# met for now: scores are set in a later step.
def meets_prerequisites(entry, context):
    if not context.feat_prerequisites:
        return True
    for prerequisite in entry.get('prerequisites') or []:
        kind = prerequisite.get('type')
        if kind == 'level' and context.level < prerequisite.get('minimum', 0):
            return False
        if kind == 'spellcasting' and not context.spellcasting:
            return False
    return True

def _qualified(entries, choice, context):
    qualifiers = choice.get('qualifiers') or []
    return [e for e in entries
            if all(_passes(e, q, context) for q in qualifiers) and meets_prerequisites(e, context)]

# Whether a weapon falls under a class's weapon proficiencies: a whole category
# ("martialWeapons"), or a category limited to weapons with any of some properties
# (Rogue: martial weapons that are Finesse or Light).
def proficient_with_weapon(weapon, proficiencies):
    category = f'{weapon.get("weaponCategory")}Weapons'
    for item in proficiencies:
        if item == category or item == weapon.get('id'):
            return True
        if isinstance(item, dict) and item.get('category') == category:
            wanted = item.get('withProperties') or []
            if not wanted or set(wanted) & set(weapon.get('properties') or []):
                return True
    return False

# A skill choice that may only pick skills the character already has (Expertise). The same
# qualifier on weapons means proficient weapons, which is filtered into the options instead.
def proficient_only(choice, options):
    return (any(q.get('type') == 'proficient' for q in choice.get('qualifiers') or [])
            and bool(options) and all(':skill/' in o['key'] for o in options))

def _literal_option(item, context, allowed_cache):
    if isinstance(item, dict):
        if 'variant' in item:  # a tool with a variant: Musical Instrument (Bagpipes)
            tool = packs.collection('tools').get(item['id'], {})
            label = f'{tool.get("name", item["id"])} ({item["variant"].replace("-", " ").title()})'
            return option(f'{item["id"]}#{item["variant"]}', label)
        grants = [
            {'name': context.features[g]['name'], 'description': context.features[g].get('description', '')}
            for g in item.get('grants', []) if g in context.features
        ]
        label = item.get('label') or item.get('name') or str(item.get('value'))
        return option(item.get('id') or label, label, item.get('description'), grants)
    if item in ABILITY_NAMES:
        return option(item, ABILITY_NAMES[item])
    if item in SIZES:
        return option(item, item.capitalize())
    collection = ID_TYPES.get(_entity_type(item))
    if collection:
        if collection not in allowed_cache:
            allowed_cache[collection] = {e['id']: e for e in allowed_entries(collection, context.allowed_content)}
        entry = allowed_cache[collection].get(item)
        return option(item, entry['name']) if entry else None
    return option(str(item), str(item).replace('-', ' ').capitalize())

def _by_name(entries):
    return sorted(entries, key=lambda e: e['name'])

# A choice's options, spelled out for the player.
def resolve_options(choice, context):
    source = choice.get('from')
    options = []
    if isinstance(source, list):
        cache = {}
        options = [o for o in (_literal_option(item, context, cache) for item in source) if o]
    elif isinstance(source, str) and _entity_type(source) == 'list':
        options = [option(i['id'], i['name'], i.get('description')) for i in context.lists.get(source, [])]
    elif isinstance(source, str) and _entity_type(source) == 'class':
        spells = [s for s in allowed_entries('spells', context.allowed_content) if source in (s.get('sourceIds') or [])]
        options = [option(s['id'], s['name'], s.get('shortDescription')) for s in _by_name(_qualified(spells, choice, context))]
    for kind in choice.get('fromTypes') or []:
        collection = ID_TYPES.get(kind)
        if collection:
            entries = _qualified(allowed_entries(collection, context.allowed_content), choice, context)
            options.extend(option(e['id'], e['name']) for e in _by_name(entries))
    return options

# A choice ready for the wizard: {id, prompt, count, options}. count may be "$column:x" or
# "$scaling", resolved by the caller and passed in.
def resolve_choice(choice, context, count=None):
    options = resolve_options(choice, context)
    return {
        'id': choice['id'],
        'prompt': choice.get('prompt', 'Choose one.'),
        'count': count if count is not None else choice.get('count', 1),
        'options': options,
        'proficientOnly': proficient_only(choice, options),
    }

def choice_refs(value):
    # The choice ids an item's effects read: "$choice:thaumaturge-cantrip" -> thaumaturge-cantrip.
    return set(re.findall(r'\$choice:([A-Za-z0-9_-]+)', repr(value)))

def _error(field, message):
    return {'field': field, 'message': message}

# Errors for picks against resolved choices. prefix makes each error's field, e.g. 'choice:'.
# proficient: skill ids the character has, for proficientOnly choices. known: every choice id
# that exists, including ones not switched on yet; picks for those are ignored, not refused
# (a player may pick Thaumaturge's cantrip, then switch to Protector).
def choice_errors(picked, choices, prefix, owner_field, proficient=frozenset(), known=None):
    if picked is None:
        picked = {}
    if not isinstance(picked, dict):
        return [_error(owner_field, 'Choices must be an object.')]
    errors = []
    for choice in choices:
        value = picked.get(choice['id'])
        keys = {o['key'] for o in choice['options']}
        field = prefix + choice['id']
        count = choice['count']
        values = value if isinstance(value, list) else ([] if value in (None, '') else [value])
        if not choice['options']:
            errors.append(_error(field, 'Nothing is available to choose here in this campaign. Ask your GM.'))
        elif len(values) < count or (count == 1 and not values):
            errors.append(_error(field, choice['prompt'] if count == 1 else f'{choice["prompt"]} (choose {count})'))
        elif len(values) > count or len(set(values)) != len(values):
            errors.append(_error(field, f'Choose exactly {count}, each only once.'))
        elif not set(values) <= keys:
            errors.append(_error(field, 'That isn’t one of the options.'))
        elif choice.get('proficientOnly') and not set(values) <= proficient:
            errors.append(_error(field, 'Choose skills you’re proficient in.'))
    unknown = set(picked) - (known if known is not None else {c['id'] for c in choices})
    if unknown:
        errors.append(_error(owner_field, f'Unknown choice: {sorted(unknown)[0]}'))
    return errors
