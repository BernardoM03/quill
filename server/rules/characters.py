# Character rules: what a new character may be built from, and whether a draft is valid.
# The creation wizard shows these errors as the player goes, and creating a character
# runs the same checks, so the browser never decides what's allowed.

from server.helpers import NAME_MAX_LENGTH, clean_name
from server.rules import packs
from server.rules.problems import allowed_ids, campaign_problems

ABILITY_NAMES = {
    'STR': 'Strength', 'DEX': 'Dexterity', 'CON': 'Constitution',
    'INT': 'Intelligence', 'WIS': 'Wisdom', 'CHA': 'Charisma',
}
SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
# The middle part of a pack id ("srd-5.2:skill/insight") and the collection it lives in.
ID_TYPES = {
    'skill': 'skills', 'feat': 'feats', 'tool': 'tools', 'language': 'languages',
    'spell': 'spells', 'species': 'species', 'class': 'classes', 'equipment': 'equipment',
}
SIZE_CHOICE_PREFIX = '$choice:'

# allowed_content: a campaign's allowedContent, or None for the Character Sandbox, which
# offers everything the installed packs have.
def _allowed(collection, allowed_content):
    entries = packs.collection(collection)
    if allowed_content is None:
        return list(entries.values())
    return [entries[i] for i in allowed_ids(allowed_content, collection, entries)]

def allowed_species(allowed_content):
    return _allowed('species', allowed_content)

def _entity_type(entry_id):
    # "srd-5.2:skill/insight" -> "skill"
    return entry_id.split(':', 1)[-1].split('/', 1)[0] if ':' in entry_id else None

# One option of a choice: key is what the player's pick is stored as (the label where the
# pack gives one, since values can repeat: Black and Copper dragons are both "acid").
def _option(key, label, description=None, grants=None):
    option = {'key': key, 'label': label}
    if description:
        option['description'] = description
    if grants:
        option['grants'] = grants
    return option

# A choice from the pack, with its options spelled out for the player. Options that refer
# to other content (skills, feats) only include what the campaign allows.
def resolve_choice(choice, species_entry, allowed_content):
    features = {f['id']: f for f in species_entry.get('subFeatures') or []}
    options = []
    source = choice.get('from')
    if isinstance(source, list):
        allowed_by_type = {}
        for item in source:
            if isinstance(item, dict):
                grants = [
                    {'name': features[g]['name'], 'description': features[g].get('description', '')}
                    for g in item.get('grants', []) if g in features
                ]
                options.append(_option(item['label'], item['label'], grants=grants))
            elif item in ABILITY_NAMES:
                options.append(_option(item, ABILITY_NAMES[item]))
            elif item in SIZES:
                options.append(_option(item, item.capitalize()))
            elif _entity_type(item) in ID_TYPES:
                collection = ID_TYPES[_entity_type(item)]
                if collection not in allowed_by_type:
                    allowed_by_type[collection] = {e['id']: e for e in _allowed(collection, allowed_content)}
                entry = allowed_by_type[collection].get(item)
                if entry:
                    options.append(_option(item, entry['name']))
            else:
                options.append(_option(str(item), str(item)))
    for kind in choice.get('fromTypes') or []:
        collection = ID_TYPES.get(kind)
        if not collection:
            continue
        entries = _allowed(collection, allowed_content)
        for qualifier in choice.get('qualifiers') or []:
            if qualifier.get('type') == 'featCategory':
                entries = [e for e in entries if e.get('category') in qualifier.get('featCategories', [])]
        options.extend(_option(e['id'], e['name']) for e in sorted(entries, key=lambda e: e['name']))
    return {
        'id': choice['id'],
        'prompt': choice.get('prompt', 'Choose one.'),
        'count': choice.get('count', 1),
        'options': options,
    }

# Everything the wizard shows for a species: type, size, speed, every trait with its
# description, and every choice the species asks for, resolved for this campaign.
def species_detail(entry, allowed_content):
    size = entry.get('creatureSize')
    species_choices = {c['id']: c for c in entry.get('choices') or []}
    size_choice = None
    if isinstance(size, str) and size.startswith(SIZE_CHOICE_PREFIX):
        size_choice = species_choices.get(size[len(SIZE_CHOICE_PREFIX):])
    traits = [{
        'id': t['id'],
        'name': t['name'],
        'shortDescription': t.get('shortDescription', ''),
        'description': t.get('description', ''),
        'choices': [resolve_choice(c, entry, allowed_content) for c in t.get('choices') or []],
    } for t in entry.get('traits', [])]
    return {
        'id': entry['id'],
        'name': entry['name'],
        'creatureType': entry.get('creatureType'),
        # The fixed sizes, or empty when the player chooses (see choices).
        'size': [] if size_choice else ([size] if isinstance(size, str) else list(size or [])),
        'speed': entry.get('speed'),
        # Choices that belong to the species itself rather than a trait, e.g. Human size.
        'choices': [resolve_choice(c, entry, allowed_content) for c in species_choices.values()],
        'traits': traits,
    }

# Every choice a species asks for, resolved: the species' own, then each trait's.
def species_choices(detail):
    return detail['choices'] + [c for t in detail['traits'] for c in t['choices']]

def _error(field, message):
    return {'field': field, 'message': message}

# Every problem with a draft, as [{field, message}]; empty when it can be created.
# draft: {name, species, speciesChoices: {choice id: option key}}.
# Fields: 'campaign', 'species', 'choice:<id>', 'name'.
def validate_draft(draft, allowed_content):
    errors = []
    if allowed_content is not None:
        problems = campaign_problems(allowed_content)
        if problems:
            errors.append(_error('campaign', 'This campaign’s settings aren’t finished, so characters can’t be '
                                             'made in it yet. Ask your GM. (' + ' '.join(problems) + ')'))

    species_id = draft.get('species')
    if not species_id:
        errors.append(_error('species', 'Choose a species.'))
    elif not isinstance(species_id, str) or species_id not in packs.collection('species'):
        errors.append(_error('species', 'That species isn’t in any installed pack.'))
    elif species_id not in {s['id'] for s in allowed_species(allowed_content)}:
        name = packs.collection('species')[species_id]['name']
        errors.append(_error('species', f'This campaign doesn’t allow {name}.'))
    else:
        errors.extend(_choice_errors(draft.get('speciesChoices'), packs.collection('species')[species_id], allowed_content))

    name = draft.get('name')
    if not isinstance(name, str) or not name.strip():
        errors.append(_error('name', 'Give your character a name.'))
    elif clean_name(name) is None:
        errors.append(_error('name', f'Name must be 1-{NAME_MAX_LENGTH} characters, with no control characters.'))
    return errors

def _choice_errors(picked, species_entry, allowed_content):
    if picked is None:
        picked = {}
    if not isinstance(picked, dict):
        return [_error('species', 'Species choices must be an object.')]
    choices = species_choices(species_detail(species_entry, allowed_content))
    errors = []
    for choice in choices:
        value = picked.get(choice['id'])
        keys = {o['key'] for o in choice['options']}
        field = f'choice:{choice["id"]}'
        if not choice['options']:
            errors.append(_error(field, 'Nothing is available to choose here in this campaign. Ask your GM.'))
        elif choice['count'] == 1:
            if value in (None, ''):
                errors.append(_error(field, choice['prompt']))
            elif value not in keys:
                errors.append(_error(field, 'That isn’t one of the options.'))
        else:
            values = value if isinstance(value, list) else []
            if len(values) != choice['count'] or len(set(values)) != len(values):
                errors.append(_error(field, f'{choice["prompt"]} (choose {choice["count"]})'))
            elif not set(values) <= keys:
                errors.append(_error(field, 'That isn’t one of the options.'))
    unknown = set(picked) - {c['id'] for c in choices}
    if unknown:
        errors.append(_error('species', f'Unknown choice for this species: {sorted(unknown)[0]}'))
    return errors
