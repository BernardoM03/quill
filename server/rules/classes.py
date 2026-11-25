from server.rules import packs
from server.rules.choices import ABILITY_NAMES, COLUMN_PREFIX, Context, active, allowed_entries, choice_refs, option, resolve_choice
from server.rules.scores import feat_increase_choices

# A class at a given level: its proficiencies, the features it has by then and every choice they bring.

SUBCLASS_CHOICE = 'subclass'
# Effectively "never" for a class without a subclass level.
NO_SUBCLASS_LEVEL = 99

def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

def _table_rows_up_to(cls, level):
    rows = sorted(cls.get('progression') or [], key=lambda row: row['level'])
    return [row for row in rows if row['level'] <= level]

# A class table column at this level, found in the row itself or among its resources.
def column_value(cls, name, level):
    value = None
    for row in _table_rows_up_to(cls, level):
        if name in row:
            value = row[name]
        elif name in (row.get('resources') or {}):
            value = row['resources'][name]
    return value

def scaling_value(feature, level):
    value = None
    for step in sorted(feature.get('scaling') or [], key=lambda step: step['level']):
        if step['level'] <= level:
            value = step['value']
    return value

def resolve_count(count, cls, feature, level):
    if isinstance(count, str) and count.startswith(COLUMN_PREFIX):
        return _to_int(column_value(cls, count[len(COLUMN_PREFIX):], level), 1)
    if count == '$scaling':
        return _to_int(scaling_value(feature, level), 1)
    return _to_int(count, 1)

# "lightArmor" becomes "Light armor".
def _label(camel_case_key):
    spaced = ''.join(' ' + char.lower() if char.isupper() else char for char in camel_case_key)
    return spaced[:1].upper() + spaced[1:]

def proficiency_names(block):
    names = []
    for item in (block or {}).get('items') or []:
        if isinstance(item, str) and ':' in item:
            names.append(packs.collection('tools').get(item, {}).get('name', item))
        elif isinstance(item, str):
            names.append(_label(item))
        elif isinstance(item, dict) and item.get('category'):
            properties = ' or '.join(prop.capitalize() for prop in item.get('withProperties') or [])
            names.append(_label(item['category']) + (f' ({properties})' if properties else ''))
    return names

# The creation-time choices of one feature, leaving out play-time ones ("when": "use").
# A choice switched on by an option of the feature's own list (Thaumaturge's extra cantrip) gets a condition.
# suffix tells repeated features apart, such as Ability Score Improvement at 4, 8 and so on.
def feature_choices(feature, cls, level, context, suffix=''):
    choices = [choice for choice in feature.get('choices') or [] if choice.get('when') != 'use']
    options = feature.get('options') or {}
    list_choice = next((choice for choice in choices if choice.get('from') == options.get('list')), None) if options else None
    conditions, play_time_only = {}, set()
    for item in options.get('items') or []:
        for ref in choice_refs(item):
            if list_choice:
                conditions[ref] = {'choice': list_choice['id'] + suffix, 'option': item['id']}
            else:
                play_time_only.add(ref)
    resolved = []
    for choice in choices:
        if choice['id'] in play_time_only:
            continue
        entry = resolve_choice(choice, context, resolve_count(choice.get('count', 1), cls, feature, level))
        entry['id'] = choice['id'] + suffix
        if choice['id'] in conditions:
            entry['condition'] = conditions[choice['id']]
        resolved.append(entry)
    return resolved

def _feature_view(feature, at_level, choices):
    return {
        'id': feature['id'],
        'name': feature['name'],
        'level': at_level,
        'shortDescription': feature.get('shortDescription', ''),
        'description': feature.get('description', ''),
        'choices': choices,
    }

# A class's or subclass's features up to this level in table order, each with its choices.
def _features_up_to(owner, cls, level, context, from_table):
    features_by_id = {feature['id']: feature for feature in owner.get('features') or []}
    if from_table:
        occurrences = [(row['level'], feature_id) for row in _table_rows_up_to(cls, level)
                       for feature_id in row.get('featureIds') or [] if feature_id in features_by_id]
    else:
        occurrences = sorted(
            ((_to_int(feature.get('level'), 1), feature['id']) for feature in features_by_id.values()
             if _to_int(feature.get('level'), 1) <= level),
            key=lambda occurrence: occurrence[0])
    times_seen, views = {}, []
    for at_level, feature_id in occurrences:
        times_seen[feature_id] = times_seen.get(feature_id, 0) + 1
        suffix = '' if times_seen[feature_id] == 1 else f'@{at_level}'
        context.choice_level = at_level
        try:
            choices = feature_choices(features_by_id[feature_id], cls, level, context, suffix)
        finally:
            context.choice_level = None
        # A score-raising feat (Ability Score Improvement) asks where once it is picked.
        choices += feat_increase_choices(choices, packs.collection('feats'))
        views.append(_feature_view(features_by_id[feature_id], at_level, choices))
    return views

def _context(cls, level, allowed_content, feat_prerequisites, extra_features=()):
    features = {feature['id']: feature for feature in list(cls.get('features') or []) + list(extra_features)}
    lists = {}
    for feature in features.values():
        options = feature.get('options') or {}
        if options.get('list'):
            lists.setdefault(options['list'], options.get('items') or [])
    return Context(allowed_content, level, lambda name: column_value(cls, name, level), features, lists,
                   feat_prerequisites=feat_prerequisites, spellcasting=bool(cls.get('spellcasting')),
                   weapon_proficiencies=(cls.get('weaponProficiencies') or {}).get('items') or [])

def _class_level_choices(cls, context):
    choices = []
    for key, choice_id, noun in (('skillProficiencies', 'class-skills', 'skill proficiencies'),
                                 ('toolProficiencies', 'class-tools', 'tool proficiencies')):
        block = cls.get(key) or {}
        if block.get('count'):
            choice = {'id': choice_id, 'count': block['count'], 'prompt': f'Choose your {noun}.'}
            if 'from' in block:
                choice['from'] = block['from']
            if 'fromTypes' in block:
                choice['fromTypes'] = block['fromTypes']
            choices.append(resolve_choice(choice, context))
    return choices

# A class dropdown entry, without features so the list stays small.
def class_summary(cls):
    return {'id': cls['id'], 'name': cls['name'], 'hitDie': cls.get('hitDie')}

def _subclass_view(subclass, cls, level, context):
    features = _features_up_to(subclass, cls, level, context, from_table=False)
    for feature in features:
        for choice in feature['choices']:
            choice.setdefault('condition', {'choice': SUBCLASS_CHOICE, 'option': subclass['id']})
    return {'id': subclass['id'], 'name': subclass['name'], 'description': subclass.get('description', ''),
            'features': features}

# Everything the class card shows at this level, with choices resolved for the campaign.
def class_detail(cls, level, allowed_content, feat_prerequisites=True):
    subclasses = []
    if level >= _to_int(cls.get('subclassLevel'), NO_SUBCLASS_LEVEL):
        subclasses = [subclass for subclass in allowed_entries('subclasses', allowed_content)
                      if subclass.get('classId') == cls['id']]
    subclass_features = [feature for subclass in subclasses for feature in subclass.get('features') or []]
    context = _context(cls, level, allowed_content, feat_prerequisites, subclass_features)
    subclass_choice = None
    if subclasses:
        subclass_choice = {
            'id': SUBCLASS_CHOICE, 'prompt': 'Choose your subclass.', 'count': 1, 'proficientOnly': False,
            'options': [option(subclass['id'], subclass['name'], subclass.get('flavor')) for subclass in subclasses],
        }
    subclass_views = [_subclass_view(subclass, cls, level, context) for subclass in subclasses]
    return {
        'id': cls['id'],
        'name': cls['name'],
        'level': level,
        'hitDie': cls.get('hitDie'),
        'primaryAbility': [ABILITY_NAMES.get(ability, ability) for ability in cls.get('primaryAbility') or []],
        'savingThrows': [ABILITY_NAMES.get(ability, ability) for ability in cls.get('savingThrowProficiencies') or []],
        'armor': proficiency_names(cls.get('armorProficiencies')),
        'weapons': proficiency_names(cls.get('weaponProficiencies')),
        'tools': proficiency_names(cls.get('toolProficiencies')),
        'subclassLevel': _to_int(cls.get('subclassLevel'), None),
        'choices': _class_level_choices(cls, context),
        'features': _features_up_to(cls, cls, level, context, from_table=True),
        'subclassChoice': subclass_choice,
        'subclasses': subclass_views,
    }

def all_choices(detail):
    everything = list(detail['choices'])
    everything += [choice for feature in detail['features'] for choice in feature['choices']]
    if detail['subclassChoice']:
        everything.append(detail['subclassChoice'])
    everything += [choice for subclass in detail['subclasses']
                   for feature in subclass['features'] for choice in feature['choices']]
    return everything

def active_choices(detail, picks):
    return active(all_choices(detail), picks)
