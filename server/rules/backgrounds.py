# Backgrounds (the packs' "origins"): what one gives a new character, and the choices it
# asks for. A background grants ability score increases, an Origin feat, skill and tool
# proficiencies, and starting equipment; the character's languages are chosen here too.
# Three campaign rules change what's chosen:
#   customizeOrigin    the increases may go to any ability, and the skills and tool are picked
#   originFeat         'background': the background's feat; 'any': any Origin feat
#   startingEquipment  'equipment' / 'gold': that package for everyone; 'choice': the player's pick

from itertools import combinations, permutations

from server.rules import packs
from server.rules.choices import ABILITY_NAMES, Context, allowed_entries, option, resolve_choice

ABILITY_CHOICE = 'ability-scores'
FEAT_CHOICE = 'origin-feat'
SKILL_CHOICE = 'background-skills'
TOOL_CHOICE = 'background-tools'
EQUIPMENT_CHOICE = 'starting-equipment'
LANGUAGE_CHOICE = 'languages'
VARIANT_CHOICE_PREFIX = '$choice:'

# The ways to spread a background's increases over its abilities: +2 to one and +1 to
# another, or +1 to three. Keys look like "WIS+2,CHA+1": the +2 first, then abilities in
# the usual order (STR to CHA), which is how the wizard's ability boxes write them.
ABILITY_POINTS = 3
ABILITY_MAX = 2

def ability_options(abilities):
    abilities = [a for a in ABILITY_NAMES if a in abilities]
    def spread(parts):
        return option(','.join(f'{a}+{n}' for a, n in parts),
                      ', '.join(f'+{n} {ABILITY_NAMES[a]}' for a, n in parts))
    return ([spread([(a, 2), (b, 1)]) for a, b in permutations(abilities, 2)]
            + [spread([(a, 1) for a in trio]) for trio in combinations(abilities, 3)])

# The increases a picked key gives, {ability: amount}, or None if the key isn't one.
def ability_increases(key):
    try:
        return {a: int(n) for a, n in (part.split('+') for part in key.split(','))}
    except (AttributeError, ValueError):
        return None

def _name(entry_id):
    for collection in ('equipment', 'tools'):
        entry = packs.collection(collection).get(entry_id)
        if entry:
            return entry['name']
    return entry_id

def _item_label(item):
    label = _name(item['id'])
    variant = item.get('variant')
    if variant:
        label += ' (your choice)' if variant.startswith(VARIANT_CHOICE_PREFIX) else f' ({variant.replace("-", " ").title()})'
    if item.get('note'):
        label += f' ({item["note"]})'
    elif item.get('quantity', 1) > 1:
        label += f' ×{item["quantity"]}'
    return label

def _package(package):
    items = [_item_label(i) for i in package.get('items', [])]
    if package.get('gold'):
        items.append(f'{package["gold"]} GP')
    return {'label': package['label'], 'items': items}

def _feat(feat):
    return {
        'id': feat['id'],
        'name': feat['name'],
        'effects': [{'name': g['name'], 'description': g.get('description', '')} for g in feat.get('effectGroups', [])],
    }

# The fixed languages and the language choice every character makes, from the first pack that sets them.
def _languages():
    for manifest in packs.load_manifests():
        languages = (manifest.get('characterCreation') or {}).get('languages')
        if languages:
            return languages
    return {}

def _names(collection, ids):
    entries = packs.collection(collection)
    return [entries[i]['name'] if i in entries else i for i in ids]

def background_summary(entry):
    return {'id': entry['id'], 'name': entry['name']}

# Everything the wizard shows for a background, with its choices resolved for the setting.
# rules: the campaign's rules with defaults. Choice ids are unique within a background,
# so picks are stored flat, like a class's.
def background_detail(entry, allowed_content, rules, level=1):
    context = Context(allowed_content, level, feat_prerequisites=rules['featPrerequisites'])
    feats = packs.collection('feats')
    customize = rules['customizeOrigin']
    abilities = list(ABILITY_NAMES) if customize else entry.get('abilityScores', [])
    choices = [{
        'id': ABILITY_CHOICE, 'prompt': 'Choose your ability score increases.', 'count': 1,
        'options': ability_options(abilities), 'proficientOnly': False,
        # Shown as one box per ability rather than a dropdown: the abilities that may be raised,
        # how many points to spend, and the most any one ability may get.
        'kind': 'abilityIncrease', 'abilities': [a for a in ABILITY_NAMES if a in abilities],
        'points': ABILITY_POINTS, 'max': ABILITY_MAX,
    }]

    skills = (entry.get('skillProficiencies') or {}).get('items', [])
    tools_block = entry.get('toolProficiencies') or {}
    fixed_tools = tools_block.get('items', [])
    if customize:
        choices.append(resolve_choice({'id': SKILL_CHOICE, 'prompt': 'Choose your skill proficiencies.',
                                       'count': len(skills) or 2, 'fromTypes': ['skill']}, context))
        choices.append(resolve_choice({'id': TOOL_CHOICE, 'prompt': 'Choose your tool proficiency.',
                                       'count': 1, 'fromTypes': ['tool']}, context))
        skills, fixed_tools = [], []
    elif tools_block.get('from'):
        choices.append(resolve_choice({**tools_block, 'prompt': tools_block.get('prompt', 'Choose your tool proficiency.')},
                                      context))

    # The Origin feat: the background's own, or (originFeat 'any') a pick among every
    # allowed Origin feat, each of whose own choices shows once it's picked.
    own_feat = feats.get(entry.get('featId'))
    feat_choices = []
    origin_feats = []
    if rules['originFeat'] == 'any':
        origin_feats = sorted((f for f in allowed_entries('feats', allowed_content) if f.get('category') == 'origin'),
                              key=lambda f: f['name'])
        choices.append({
            'id': FEAT_CHOICE, 'prompt': 'Choose your Origin feat.', 'count': 1, 'proficientOnly': False,
            'options': [option(f['id'], f['name']) for f in origin_feats],
        })
        for f in origin_feats:
            for c in f.get('choices') or []:
                feat_choices.append({**resolve_choice(c, context), 'condition': {'choice': FEAT_CHOICE, 'option': f['id']}})
        own_feat = None
    elif own_feat:
        feat_choices = [resolve_choice(c, context) for c in own_feat.get('choices') or []]

    packages = (entry.get('startingEquipment') or {}).get('options', [])
    if rules['startingEquipment'] == 'choice' and len(packages) > 1:
        choices.append({
            'id': EQUIPMENT_CHOICE, 'prompt': 'Choose your starting equipment.', 'count': 1, 'proficientOnly': False,
            'options': [option(p['label'], f'Package {p["label"]}', ', '.join(_package(p)['items'])) for p in packages],
        })
        given = None
    else:
        # 'equipment': the package with items; 'gold': the one with the most gold instead.
        pick = max(packages, key=lambda p: p.get('gold', 0)) if rules['startingEquipment'] == 'gold' else (
            next((p for p in packages if p.get('items')), packages[0] if packages else None))
        given = pick and pick['label']

    languages = _languages()
    if languages.get('choose'):
        choices.append(resolve_choice({'id': LANGUAGE_CHOICE, 'prompt': 'Choose your languages.', **languages['choose']},
                                      context))

    return {
        'id': entry['id'],
        'name': entry['name'],
        'description': entry.get('description', ''),
        'abilityScores': [ABILITY_NAMES[a] for a in entry.get('abilityScores', [])],
        # Proficiencies and languages given outright, as ids (fixed) and names (for show).
        'fixed': skills + fixed_tools + languages.get('items', []),
        'skills': _names('skills', skills),
        'tools': _names('tools', fixed_tools),
        'languages': _names('languages', languages.get('items', [])),
        'feat': _feat(own_feat) if own_feat else None,
        # With originFeat 'any': every Origin feat on offer, to show the one picked.
        'originFeats': [_feat(f) for f in origin_feats],
        'equipment': [_package(p) for p in packages],
        # The package everyone gets under the campaign's rule, or None when the player picks.
        'givenEquipment': given,
        'choices': choices,
        # The feat's own choices: Magic Initiate's spells. With originFeat 'any', conditional.
        'featChoices': feat_choices,
    }

def all_background_choices(detail):
    return detail['choices'] + detail['featChoices']
