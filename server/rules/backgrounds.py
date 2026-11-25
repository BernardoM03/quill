from server.rules import packs
from server.rules.choices import ABILITY_NAMES, Context, allowed_entries, option, resolve_choice
from server.rules.scores import spread_options

# A background (the packs' "origins") grants ability increases, an Origin feat, skills, tools and equipment.
# customizeOrigin lets the increases go anywhere and makes the skills and tool picks.
# originFeat is 'background' for the background's own feat or 'any' for any Origin feat.
# startingEquipment is 'equipment' or 'gold' for everyone, or 'choice' for the player's pick.

ABILITY_CHOICE = 'ability-scores'
FEAT_CHOICE = 'origin-feat'
SKILL_CHOICE = 'background-skills'
TOOL_CHOICE = 'background-tools'
EQUIPMENT_CHOICE = 'starting-equipment'
LANGUAGE_CHOICE = 'languages'
VARIANT_CHOICE_PREFIX = '$choice:'

# Background increases are +2 to one ability and +1 to another, or +1 to three.
ABILITY_POINTS = 3
ABILITY_MAX = 2
DEFAULT_SKILL_COUNT = 2

def ability_options(abilities):
    return spread_options(abilities, ABILITY_POINTS, ABILITY_MAX)

def _item_name(entry_id):
    for collection in ('equipment', 'tools'):
        entry = packs.collection(collection).get(entry_id)
        if entry:
            return entry['name']
    return entry_id

def _item_label(item):
    label = _item_name(item['id'])
    variant = item.get('variant')
    if variant:
        label += ' (your choice)' if variant.startswith(VARIANT_CHOICE_PREFIX) else f' ({variant.replace("-", " ").title()})'
    if item.get('note'):
        label += f' ({item["note"]})'
    elif item.get('quantity', 1) > 1:
        label += f' ×{item["quantity"]}'
    return label

def _package_view(package):
    items = [_item_label(item) for item in package.get('items', [])]
    if package.get('gold'):
        items.append(f'{package["gold"]} GP')
    return {'label': package['label'], 'items': items}

def _feat_view(feat):
    return {
        'id': feat['id'],
        'name': feat['name'],
        'effects': [{'name': group['name'], 'description': group.get('description', '')}
                    for group in feat.get('effectGroups', [])],
    }

# The fixed languages and the language choice, from the first pack that sets them.
def _languages():
    for manifest in packs.load_manifests():
        languages = (manifest.get('characterCreation') or {}).get('languages')
        if languages:
            return languages
    return {}

def _names(collection, entry_ids):
    entries = packs.collection(collection)
    return [entries[entry_id]['name'] if entry_id in entries else entry_id for entry_id in entry_ids]

def background_summary(entry):
    return {'id': entry['id'], 'name': entry['name']}

# The package everyone receives: the one with most gold under 'gold', else the first with items.
def _given_package(packages, equipment_rule):
    if equipment_rule == 'gold':
        return max(packages, key=lambda package: package.get('gold', 0))
    return next((package for package in packages if package.get('items')), packages[0] if packages else None)

def _ability_choice(abilities):
    return {
        'id': ABILITY_CHOICE, 'prompt': 'Choose your ability score increases.', 'count': 1,
        'options': ability_options(abilities), 'proficientOnly': False,
        # Rendered as one box per ability, with the points to spend and the most any one may get.
        'kind': 'abilityIncrease', 'abilities': [ability for ability in ABILITY_NAMES if ability in abilities],
        'points': ABILITY_POINTS, 'max': ABILITY_MAX,
    }

# Everything the wizard shows for a background, with choices resolved for the setting.
# Choice ids are unique within a background, so picks are stored flat like a class's.
def background_detail(entry, allowed_content, rules, level=1):
    context = Context(allowed_content, level, feat_prerequisites=rules['featPrerequisites'])
    feats = packs.collection('feats')
    customize = rules['customizeOrigin']
    abilities = list(ABILITY_NAMES) if customize else entry.get('abilityScores', [])
    choices = [_ability_choice(abilities)]

    skills = (entry.get('skillProficiencies') or {}).get('items', [])
    tools_block = entry.get('toolProficiencies') or {}
    fixed_tools = tools_block.get('items', [])
    if customize:
        choices.append(resolve_choice({'id': SKILL_CHOICE, 'prompt': 'Choose your skill proficiencies.',
                                       'count': len(skills) or DEFAULT_SKILL_COUNT, 'fromTypes': ['skill']}, context))
        choices.append(resolve_choice({'id': TOOL_CHOICE, 'prompt': 'Choose your tool proficiency.',
                                       'count': 1, 'fromTypes': ['tool']}, context))
        skills, fixed_tools = [], []
    elif tools_block.get('from'):
        choices.append(resolve_choice({**tools_block, 'prompt': tools_block.get('prompt', 'Choose your tool proficiency.')},
                                      context))

    # Under originFeat 'any' the player picks among allowed Origin feats, each with its own conditional choices.
    own_feat = feats.get(entry.get('featId'))
    feat_choices = []
    origin_feats = []
    if rules['originFeat'] == 'any':
        origin_feats = sorted((feat for feat in allowed_entries('feats', allowed_content) if feat.get('category') == 'origin'),
                              key=lambda feat: feat['name'])
        choices.append({
            'id': FEAT_CHOICE, 'prompt': 'Choose your Origin feat.', 'count': 1, 'proficientOnly': False,
            'options': [option(feat['id'], feat['name']) for feat in origin_feats],
        })
        for feat in origin_feats:
            for choice in feat.get('choices') or []:
                feat_choices.append({**resolve_choice(choice, context),
                                     'condition': {'choice': FEAT_CHOICE, 'option': feat['id']}})
        own_feat = None
    elif own_feat:
        feat_choices = [resolve_choice(choice, context) for choice in own_feat.get('choices') or []]

    packages = (entry.get('startingEquipment') or {}).get('options', [])
    if rules['startingEquipment'] == 'choice' and len(packages) > 1:
        choices.append({
            'id': EQUIPMENT_CHOICE, 'prompt': 'Choose your starting equipment.', 'count': 1, 'proficientOnly': False,
            'options': [option(package['label'], f'Package {package["label"]}', ', '.join(_package_view(package)['items']))
                        for package in packages],
        })
        given_package_label = None
    else:
        given_package = _given_package(packages, rules['startingEquipment'])
        given_package_label = given_package and given_package['label']

    languages = _languages()
    if languages.get('choose'):
        choices.append(resolve_choice({'id': LANGUAGE_CHOICE, 'prompt': 'Choose your languages.', **languages['choose']},
                                      context))

    return {
        'id': entry['id'],
        'name': entry['name'],
        'description': entry.get('description', ''),
        'abilityScores': [ABILITY_NAMES[ability] for ability in entry.get('abilityScores', [])],
        # Proficiencies and languages given outright, as ids (fixed) and as names for display.
        'fixed': skills + fixed_tools + languages.get('items', []),
        'skills': _names('skills', skills),
        'tools': _names('tools', fixed_tools),
        'languages': _names('languages', languages.get('items', [])),
        'feat': _feat_view(own_feat) if own_feat else None,
        'originFeats': [_feat_view(feat) for feat in origin_feats],
        'equipment': [_package_view(package) for package in packages],
        # None when the player picks the package.
        'givenEquipment': given_package_label,
        'choices': choices,
        # The feat's own choices, such as Magic Initiate's spells.
        'featChoices': feat_choices,
    }

def all_background_choices(detail):
    return detail['choices'] + detail['featChoices']
