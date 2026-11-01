# Character rules: what a new character may be built from, and whether a draft is valid.
# The creation wizard shows these errors as the player goes, and creating a character
# runs the same checks, so the browser never decides what's allowed.
#
# A "setting" is where the character is made: a campaign's allowedContent and rules, or
# the Character Sandbox (allowed None: everything installed; the default rules).

from server.helpers import NAME_MAX_LENGTH, clean_name
from server.rules import packs
from server.rules.choices import Context, allowed_entries, choice_errors, resolve_choice
from server.rules.classes import active_choices, all_choices, class_detail
from server.rules.problems import campaign_problems
from server.rules.settings import starting_level, with_rule_defaults

SIZE_CHOICE_PREFIX = '$choice:'

class Setting:
    def __init__(self, allowed_content, stored_rules):
        self.allowed = allowed_content
        self.rules = with_rule_defaults(stored_rules)
        # A new character's level: the campaign's milestone level, else 1.
        self.level = starting_level(self.rules)

def allowed_species(setting):
    return allowed_entries('species', setting.allowed)

def allowed_classes(setting):
    return allowed_entries('classes', setting.allowed)

# Everything the wizard shows for a species: type, size, speed, every trait with its
# description, and every choice the species asks for, resolved for this setting.
def species_detail(entry, setting):
    context = Context(setting.allowed, setting.level, features={f['id']: f for f in entry.get('subFeatures') or []},
                      feat_prerequisites=setting.rules['featPrerequisites'])
    size = entry.get('creatureSize')
    own_choices = {c['id']: c for c in entry.get('choices') or []}
    size_choice = None
    if isinstance(size, str) and size.startswith(SIZE_CHOICE_PREFIX):
        size_choice = own_choices.get(size[len(SIZE_CHOICE_PREFIX):])
    traits = [{
        'id': t['id'],
        'name': t['name'],
        'shortDescription': t.get('shortDescription', ''),
        'description': t.get('description', ''),
        'choices': [resolve_choice(c, context) for c in t.get('choices') or []],
    } for t in entry.get('traits', [])]
    return {
        'id': entry['id'],
        'name': entry['name'],
        'creatureType': entry.get('creatureType'),
        # The fixed sizes, or empty when the player chooses (see choices).
        'size': [] if size_choice else ([size] if isinstance(size, str) else list(size or [])),
        'speed': entry.get('speed'),
        # Choices that belong to the species itself rather than a trait, e.g. Human size.
        'choices': [resolve_choice(c, context) for c in own_choices.values()],
        'traits': traits,
    }

# Every choice a species asks for: the species' own, then each trait's.
def species_choices(detail):
    return detail['choices'] + [c for t in detail['traits'] for c in t['choices']]

def class_detail_for(class_id, setting):
    return class_detail(packs.collection('classes')[class_id], setting.level, setting.allowed,
                        setting.rules['featPrerequisites'])

def _error(field, message):
    return {'field': field, 'message': message}

# The class picks worth keeping: only those for choices that are switched on.
def kept_class_choices(draft, setting):
    picks = draft.get('classChoices') or {}
    active = {c['id'] for c in active_choices(class_detail_for(draft['class'], setting), picks)}
    return {k: v for k, v in picks.items() if k in active}

# Checks that an id names an installed entry the setting allows. Returns an error or None.
def _pick_error(field, entry_id, collection, noun, setting):
    if not entry_id:
        return _error(field, f'Choose a {noun}.')
    entries = packs.collection(collection)
    if not isinstance(entry_id, str) or entry_id not in entries:
        return _error(field, f'That {noun} isn’t in any installed pack.')
    if entry_id not in {e['id'] for e in allowed_entries(collection, setting.allowed)}:
        return _error(field, f'This campaign doesn’t allow {entries[entry_id]["name"]}.')
    return None

# Skill ids the draft already has: picked as class skills or through a species choice.
# Expertise-style choices may only pick from these.
def _proficient_skills(draft, species_choice_list):
    skills = set()
    for value in list((draft.get('speciesChoices') or {}).values()) + [(draft.get('classChoices') or {}).get('class-skills')]:
        for v in value if isinstance(value, list) else [value]:
            if isinstance(v, str) and ':skill/' in v:
                skills.add(v)
    return frozenset(skills)

# Every problem with a draft, as [{field, message}]; empty when it can be created.
# draft: {name, species, speciesChoices, class, classChoices}; choices map choice id -> key(s).
# Fields: 'campaign', 'species', 'choice:<id>', 'class', 'classChoice:<id>', 'name'.
def validate_draft(draft, setting):
    errors = []
    if setting.allowed is not None:
        problems = campaign_problems(setting.allowed)
        if problems:
            errors.append(_error('campaign', 'This campaign’s settings aren’t finished, so characters can’t be '
                                             'made in it yet. Ask your GM. (' + ' '.join(problems) + ')'))

    species_choice_list = []
    problem = _pick_error('species', draft.get('species'), 'species', 'species', setting)
    if problem:
        errors.append(problem)
    else:
        species_choice_list = species_choices(species_detail(packs.collection('species')[draft['species']], setting))
        errors.extend(choice_errors(draft.get('speciesChoices'), species_choice_list, 'choice:', 'species'))

    problem = _pick_error('class', draft.get('class'), 'classes', 'class', setting)
    if problem:
        errors.append(problem)
    else:
        picks = draft.get('classChoices') if isinstance(draft.get('classChoices'), dict) else {}
        detail = class_detail_for(draft['class'], setting)
        errors.extend(choice_errors(draft.get('classChoices'), active_choices(detail, picks), 'classChoice:', 'class',
                                    proficient=_proficient_skills(draft, species_choice_list),
                                    known={c['id'] for c in all_choices(detail)}))

    name = draft.get('name')
    if not isinstance(name, str) or not name.strip():
        errors.append(_error('name', 'Give your character a name.'))
    elif clean_name(name) is None:
        errors.append(_error('name', f'Name must be 1-{NAME_MAX_LENGTH} characters, with no control characters.'))
    return errors
