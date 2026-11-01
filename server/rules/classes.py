# A class as it is at a given level: its proficiencies, every feature it has by then, and
# every choice those bring, including the subclass once the level reaches it.

from server.rules import packs
from server.rules.choices import ABILITY_NAMES, Context, active, allowed_entries, choice_refs, option, resolve_choice

SUBCLASS_CHOICE = 'subclass'

def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

def _rows(cls, level):
    return [r for r in sorted(cls.get('progression') or [], key=lambda r: r['level']) if r['level'] <= level]

# A column of the class table at this level: in the row itself or among its resources.
def column_value(cls, name, level):
    value = None
    for row in _rows(cls, level):
        if name in row:
            value = row[name]
        elif name in (row.get('resources') or {}):
            value = row['resources'][name]
    return value

def scaling_value(feature, level):
    value = None
    for step in sorted(feature.get('scaling') or [], key=lambda s: s['level']):
        if step['level'] <= level:
            value = step['value']
    return value

def resolve_count(count, cls, feature, level):
    if isinstance(count, str) and count.startswith('$column:'):
        return _int(column_value(cls, count[len('$column:'):], level), 1)
    if count == '$scaling':
        return _int(scaling_value(feature, level), 1)
    return _int(count, 1)

def _label(key):
    # "lightArmor" -> "Light armor", "martialWeapons" -> "Martial weapons"
    spaced = ''.join(' ' + c.lower() if c.isupper() else c for c in key)
    return spaced[:1].upper() + spaced[1:]

def _proficiency_names(block):
    names = []
    for item in (block or {}).get('items') or []:
        if isinstance(item, str) and ':' in item:
            names.append(packs.collection('tools').get(item, {}).get('name', item))
        elif isinstance(item, str):
            names.append(_label(item))
        elif isinstance(item, dict) and item.get('category'):
            limits = ' or '.join(p.capitalize() for p in item.get('withProperties') or [])
            names.append(_label(item['category']) + (f' ({limits})' if limits else ''))
    return names

# The choices one feature asks for at creation. Choices made during play ("when": "use")
# are left out. A choice that one option of the feature's own list switches on (Thaumaturge
# -> an extra cantrip) gets a condition; one only play-time options use is left out.
# suffix tells repeated features apart (Ability Score Improvement at 4, 8, ...).
def feature_choices(feature, cls, level, context, suffix=''):
    choices = [c for c in feature.get('choices') or [] if c.get('when') != 'use']
    options = feature.get('options') or {}
    list_choice = next((c for c in choices if c.get('from') == options.get('list')), None) if options else None
    conditions, play_time = {}, set()
    for item in options.get('items') or []:
        for ref in choice_refs(item):
            if list_choice:
                conditions[ref] = {'choice': list_choice['id'] + suffix, 'option': item['id']}
            else:
                play_time.add(ref)
    resolved = []
    for choice in choices:
        if choice['id'] in play_time:
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

# A class's or subclass's features up to this level, in table order, each with its choices.
def _features_up_to(owner, cls, level, context, from_table):
    by_id = {f['id']: f for f in owner.get('features') or []}
    if from_table:
        occurrences = [(row['level'], fid) for row in _rows(cls, level) for fid in row.get('featureIds') or [] if fid in by_id]
    else:
        occurrences = sorted(
            ((_int(f.get('level'), 1), f['id']) for f in by_id.values() if _int(f.get('level'), 1) <= level),
            key=lambda o: o[0])
    seen, views = {}, []
    for at_level, fid in occurrences:
        seen[fid] = seen.get(fid, 0) + 1
        suffix = '' if seen[fid] == 1 else f'@{at_level}'
        views.append(_feature_view(by_id[fid], at_level, feature_choices(by_id[fid], cls, level, context, suffix)))
    return views

def _context(cls, level, allowed_content, feat_prerequisites, extra_features=()):
    features = {f['id']: f for f in list(cls.get('features') or []) + list(extra_features)}
    lists = {}
    for f in features.values():
        options = f.get('options') or {}
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

# Summaries for the class dropdown: no features, so the list stays small.
def class_summary(cls):
    return {'id': cls['id'], 'name': cls['name'], 'hitDie': cls.get('hitDie')}

# Everything the class card shows at this level, choices resolved for this campaign.
# feat_prerequisites: the campaign's rule of that name.
def class_detail(cls, level, allowed_content, feat_prerequisites=True):
    subclasses = []
    if level >= _int(cls.get('subclassLevel'), 99):
        subclasses = [s for s in allowed_entries('subclasses', allowed_content) if s.get('classId') == cls['id']]
    context = _context(cls, level, allowed_content, feat_prerequisites,
                       [f for s in subclasses for f in s.get('features') or []])
    subclass_choice = None
    if subclasses:
        subclass_choice = {
            'id': SUBCLASS_CHOICE, 'prompt': 'Choose your subclass.', 'count': 1, 'proficientOnly': False,
            'options': [option(s['id'], s['name'], s.get('flavor')) for s in subclasses],
        }
    sub_views = []
    for s in subclasses:
        features = _features_up_to(s, cls, level, context, from_table=False)
        for f in features:
            for c in f['choices']:
                c.setdefault('condition', {'choice': SUBCLASS_CHOICE, 'option': s['id']})
        sub_views.append({'id': s['id'], 'name': s['name'], 'description': s.get('description', ''), 'features': features})
    return {
        'id': cls['id'],
        'name': cls['name'],
        'level': level,
        'hitDie': cls.get('hitDie'),
        'primaryAbility': [ABILITY_NAMES.get(a, a) for a in cls.get('primaryAbility') or []],
        'savingThrows': [ABILITY_NAMES.get(a, a) for a in cls.get('savingThrowProficiencies') or []],
        'armor': _proficiency_names(cls.get('armorProficiencies')),
        'weapons': _proficiency_names(cls.get('weaponProficiencies')),
        'tools': _proficiency_names(cls.get('toolProficiencies')),
        'subclassLevel': _int(cls.get('subclassLevel'), None),
        'choices': _class_level_choices(cls, context),
        'features': _features_up_to(cls, cls, level, context, from_table=True),
        'subclassChoice': subclass_choice,
        'subclasses': sub_views,
    }

def all_choices(detail):
    everything = list(detail['choices'])
    everything += [c for f in detail['features'] for c in f['choices']]
    if detail['subclassChoice']:
        everything.append(detail['subclassChoice'])
    everything += [c for s in detail['subclasses'] for f in s['features'] for c in f['choices']]
    return everything

# The choices that apply given the picks so far (see choices.active).
def active_choices(detail, picks):
    return active(all_choices(detail), picks)
