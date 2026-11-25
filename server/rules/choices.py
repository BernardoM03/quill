import re

from server.rules import packs
from server.rules.common import field_error, picked_values
from server.rules.problems import allowed_ids

# Turns a pack "choice" into options a player can pick, for species, classes and subclasses.
# Options come from a literal list (from: [...]), a named list (from: "<pack>:list/x"),
# a class spell list (from: "<pack>:class/x") or every entry of some kinds (fromTypes).
# Qualifiers then narrow the options, and only content the campaign allows is offered.

ABILITY_NAMES = {
    'STR': 'Strength', 'DEX': 'Dexterity', 'CON': 'Constitution',
    'INT': 'Intelligence', 'WIS': 'Wisdom', 'CHA': 'Charisma',
}
SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
# The type segment of a pack id ("srd-5.2:skill/insight") mapped to its collection.
ID_TYPES = {
    'skill': 'skills', 'feat': 'feats', 'tool': 'tools', 'language': 'languages', 'spell': 'spells',
    'species': 'species', 'class': 'classes', 'subclass': 'subclasses', 'equipment': 'equipment',
    'creature': 'creatures',
}
COLUMN_PREFIX = '$column:'
CHOICE_REF_PATTERN = re.compile(r'\$choice:([A-Za-z0-9_-]+)')

# "srd-5.2:skill/insight" becomes "skill".
def _entity_type(entry_id):
    if not isinstance(entry_id, str) or ':' not in entry_id:
        return None
    return entry_id.split(':', 1)[1].split('/', 1)[0]

def allowed_entries(collection, allowed_content):
    entries = packs.collection(collection)
    if allowed_content is None:
        return list(entries.values())
    return [entries[entry_id] for entry_id in allowed_ids(allowed_content, collection, entries)]

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
        # The level the choice being resolved is gained at, when it differs from the character's level.
        self.choice_level = None
        # When the campaign's "Feat Prerequisites" rule is off, any feat can be picked.
        self.feat_prerequisites = feat_prerequisites
        # Whether the class being built has the Spellcasting feature.
        self.spellcasting = spellcasting
        # Items like "simpleWeapons" or {category, withProperties}.
        self.weapon_proficiencies = weapon_proficiencies
        # column(name) returns the class table's value at this level, e.g. wildShapeMaxCr.
        self.column = column or (lambda name: None)
        # Feature id -> feature, for {value, label, grants} options.
        self.features = features or {}
        # List id -> items, for from: "<pack>:list/x".
        self.lists = lists or {}

def _resolve_number(value, context):
    if isinstance(value, str) and value.startswith(COLUMN_PREFIX):
        return context.column(value[len(COLUMN_PREFIX):])
    return value

def _passes(entry, qualifier, context):
    qualifier_type = qualifier.get('type')
    if qualifier_type == 'featCategory':
        result = entry.get('category') in qualifier.get('featCategories', [])
    elif qualifier_type == 'spellLevel':
        result = entry.get('level') in qualifier.get('spellLevels', [])
    elif qualifier_type == 'spellSchool':
        result = entry.get('school') in qualifier.get('schools', [])
    elif qualifier_type == 'spellSource':
        result = qualifier.get('sourceId') in (entry.get('sourceIds') or [])
    elif qualifier_type == 'equipment':
        result = entry.get('category') in qualifier.get('equipment', [])
    elif qualifier_type == 'attackRange':
        result = entry.get('attackRange') in qualifier.get('attackRanges', [])
    elif qualifier_type == 'creatureType':
        result = entry.get('creatureType') in qualifier.get('creatureTypes', [])
    elif qualifier_type == 'challengeRating':
        max_rating = _resolve_number(qualifier.get('atMost'), context)
        result = max_rating is None or (entry.get('challengeRating') is not None and entry['challengeRating'] <= max_rating)
    elif qualifier_type == 'hasSpeed':
        result = any(speed in (entry.get('speed') or {}) for speed in qualifier.get('speeds', []))
    elif qualifier_type == 'classLevel':
        result = context.level >= qualifier.get('atLeast', 0)
    elif qualifier_type == 'anyOf':
        result = any(_passes(entry, inner, context) for inner in qualifier.get('qualifiers', []))
    elif qualifier_type == 'proficient' and entry.get('category') == 'weapon':
        result = proficient_with_weapon(entry, context.weapon_proficiencies)
    else:
        # 'proficient' on skills is checked when validating, and unknown qualifiers don't narrow.
        result = True
    return not result if qualifier.get('negate') else result

# What a feat's prerequisites are checked against, where None means "not known yet".
# While the wizard builds options, unknown facts count as met and are rechecked on validation.
class Facts:
    def __init__(self, level, spellcasting, scores=None, feats=None, proficiencies=None):
        self.level = level
        self.spellcasting = spellcasting
        self.scores = scores                # {'STR': 15, ...}, where a None score is unknown
        self.feats = feats                  # set of feat ids the character has
        self.proficiencies = proficiencies  # set of lowercased ids and names

def _describe(prerequisite):
    prerequisite_type = prerequisite.get('type')
    if prerequisite_type == 'ability':
        ability = prerequisite.get('ability')
        return f'{ABILITY_NAMES.get(ability, ability)} {prerequisite.get("minimum")}+'
    if prerequisite_type == 'level':
        return f'level {prerequisite.get("minimum")}+'
    if prerequisite_type == 'feat':
        feat = packs.collection('feats').get(prerequisite.get('featId')) or {}
        return f'the {feat.get("name", prerequisite.get("featId"))} feat'
    if prerequisite_type == 'proficiency':
        return f'proficiency with {prerequisite.get("proficiency")}'
    if prerequisite_type == 'spellcasting':
        return 'the Spellcasting feature'
    if prerequisite_type == 'any':
        return ' or '.join(_describe(inner) for inner in prerequisite.get('of') or [])
    return str(prerequisite_type)

# Matches a proficiency by name or by the slug at the end of an id.
def _proficiency_matches(wanted, proficiencies):
    wanted = str(wanted).lower()
    slug = '/' + wanted.replace(' ', '-')
    return any(wanted == proficiency or proficiency.endswith(slug) for proficiency in proficiencies)

def _is_met(prerequisite, facts):
    prerequisite_type = prerequisite.get('type')
    if prerequisite_type == 'level':
        return facts.level >= prerequisite.get('minimum', 0)
    if prerequisite_type == 'spellcasting':
        return facts.spellcasting
    if prerequisite_type == 'ability':
        score = (facts.scores or {}).get(prerequisite.get('ability'))
        return score is None or score >= prerequisite.get('minimum', 0)
    if prerequisite_type == 'feat':
        return facts.feats is None or prerequisite.get('featId') in facts.feats
    if prerequisite_type == 'proficiency':
        return facts.proficiencies is None or _proficiency_matches(prerequisite.get('proficiency'), facts.proficiencies)
    if prerequisite_type == 'any':
        return any(_is_met(inner, facts) for inner in prerequisite.get('of') or [])
    return True

# The first unmet prerequisite of a feat, described for a message, or None when all are met.
def unmet_prerequisite(entry, facts):
    for prerequisite in entry.get('prerequisites') or []:
        if not _is_met(prerequisite, facts):
            return _describe(prerequisite)
    return None

# Uses the level the choice is gained at, so an ASI at level 4 can't take a level-19 Epic Boon.
def meets_prerequisites(entry, context):
    if not context.feat_prerequisites:
        return True
    return unmet_prerequisite(entry, Facts(context.choice_level or context.level, context.spellcasting)) is None

def _qualified(entries, choice, context):
    qualifiers = choice.get('qualifiers') or []
    return [entry for entry in entries
            if all(_passes(entry, qualifier, context) for qualifier in qualifiers)
            and meets_prerequisites(entry, context)]

# Whether a weapon falls under a whole proficiency category or a category limited by properties.
def proficient_with_weapon(weapon, proficiencies):
    category = f'{weapon.get("weaponCategory")}Weapons'
    for item in proficiencies:
        if item == category or item == weapon.get('id'):
            return True
        if isinstance(item, dict) and item.get('category') == category:
            required_properties = item.get('withProperties') or []
            if not required_properties or set(required_properties) & set(weapon.get('properties') or []):
                return True
    return False

# A skill choice limited to skills the character already has, like Expertise.
def proficient_only(choice, options):
    return (any(qualifier.get('type') == 'proficient' for qualifier in choice.get('qualifiers') or [])
            and bool(options) and all(':skill/' in opt['key'] for opt in options))

def _literal_option(item, context, allowed_by_collection):
    if isinstance(item, dict):
        if 'variant' in item:
            # A tool with a variant, such as Musical Instrument (Bagpipes).
            tool = packs.collection('tools').get(item['id'], {})
            label = f'{tool.get("name", item["id"])} ({item["variant"].replace("-", " ").title()})'
            return option(f'{item["id"]}#{item["variant"]}', label)
        grants = [
            {'name': context.features[grant]['name'], 'description': context.features[grant].get('description', '')}
            for grant in item.get('grants', []) if grant in context.features
        ]
        label = item.get('label') or item.get('name') or str(item.get('value'))
        return option(item.get('id') or label, label, item.get('description'), grants)
    if item in ABILITY_NAMES:
        return option(item, ABILITY_NAMES[item])
    if item in SIZES:
        return option(item, item.capitalize())
    collection = ID_TYPES.get(_entity_type(item))
    if collection:
        if collection not in allowed_by_collection:
            allowed_by_collection[collection] = {
                entry['id']: entry for entry in allowed_entries(collection, context.allowed_content)
            }
        entry = allowed_by_collection[collection].get(item)
        return option(item, entry['name'], entry_description(entry)) if entry else None
    return option(str(item), str(item).replace('-', ' ').capitalize())

# The text shown under a picked spell, feat or language, or None for other entries.
def entry_description(entry):
    if entry.get('shortDescription'):
        return entry['shortDescription']
    effect_groups = entry.get('effectGroups')
    if effect_groups:
        return '\n\n'.join(f'**{group["name"]}.** {group.get("description", "")}' for group in effect_groups)
    return entry.get('description')

def _sorted_by_name(entries):
    return sorted(entries, key=lambda entry: entry['name'])

def resolve_options(choice, context):
    source = choice.get('from')
    options = []
    if isinstance(source, list):
        allowed_by_collection = {}
        resolved = (_literal_option(item, context, allowed_by_collection) for item in source)
        options = [opt for opt in resolved if opt]
    elif isinstance(source, str) and _entity_type(source) == 'list':
        options = [option(item['id'], item['name'], item.get('description')) for item in context.lists.get(source, [])]
    elif isinstance(source, str) and _entity_type(source) == 'class':
        spells = [spell for spell in allowed_entries('spells', context.allowed_content)
                  if source in (spell.get('sourceIds') or [])]
        options = [option(spell['id'], spell['name'], spell.get('shortDescription'))
                   for spell in _sorted_by_name(_qualified(spells, choice, context))]
    for entry_type in choice.get('fromTypes') or []:
        collection = ID_TYPES.get(entry_type)
        if collection:
            entries = _qualified(allowed_entries(collection, context.allowed_content), choice, context)
            options.extend(option(entry['id'], entry['name'], entry_description(entry)) for entry in _sorted_by_name(entries))
    return options

# A choice ready for the wizard as {id, prompt, count, options, proficientOnly}.
# The caller resolves counts like "$column:x" or "$scaling" and passes them in.
def resolve_choice(choice, context, count=None):
    options = resolve_options(choice, context)
    return {
        'id': choice['id'],
        'prompt': choice.get('prompt', 'Choose one.'),
        'count': count if count is not None else choice.get('count', 1),
        'options': options,
        'proficientOnly': proficient_only(choice, options),
    }

# Choices without a condition, plus those whose condition option has been picked.
def active(choices, picks):
    def is_switched_on(choice):
        condition = choice.get('condition')
        if not condition:
            return True
        picked = picks.get(condition['choice'])
        return condition['option'] == picked or (isinstance(picked, list) and condition['option'] in picked)
    return [choice for choice in choices if is_switched_on(choice)]

# The choice ids an item's effects read, e.g. "$choice:thaumaturge-cantrip" gives thaumaturge-cantrip.
def choice_refs(value):
    return set(CHOICE_REF_PATTERN.findall(repr(value)))

# Errors for picks against resolved choices, with each field named prefix + choice id.
# proficient holds the character's skill ids, for proficientOnly choices.
# known lists every existing choice id, so picks for choices not yet switched on are ignored rather than refused.
def choice_errors(picked, choices, prefix, owner_field, proficient=frozenset(), known=None):
    if picked is None:
        picked = {}
    if not isinstance(picked, dict):
        return [field_error(owner_field, 'Choices must be an object.')]
    errors = []
    for choice in choices:
        option_keys = {opt['key'] for opt in choice['options']}
        field = prefix + choice['id']
        count = choice['count']
        values = picked_values(picked.get(choice['id']))
        if not choice['options']:
            errors.append(field_error(field, 'Nothing is available to choose here in this campaign. Ask your GM.'))
        elif len(values) < count or (count == 1 and not values):
            errors.append(field_error(field, choice['prompt'] if count == 1 else f'{choice["prompt"]} (choose {count})'))
        elif len(values) > count or len(set(values)) != len(values):
            errors.append(field_error(field, f'Choose exactly {count}, each only once.'))
        elif not set(values) <= option_keys:
            errors.append(field_error(field, 'That isn’t one of the options.'))
        elif choice.get('proficientOnly') and not set(values) <= proficient:
            errors.append(field_error(field, 'Choose skills you’re proficient in.'))
    known_ids = known if known is not None else {choice['id'] for choice in choices}
    unknown_ids = set(picked) - known_ids
    if unknown_ids:
        errors.append(field_error(owner_field, f'Unknown choice: {sorted(unknown_ids)[0]}'))
    return errors
