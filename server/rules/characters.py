from server.helpers import NAME_MAX_LENGTH, clean_name
from server.rules import packs
from server.rules.abilities import ability_errors, hit_points, hp_bonuses, hp_errors, hp_features, hp_method
from server.rules.backgrounds import (
    ABILITY_CHOICE, ABILITY_MAX, ABILITY_POINTS, EQUIPMENT_CHOICE, all_background_choices, background_detail,
)
from server.rules.choices import (
    ABILITY_NAMES, Context, Facts, active, allowed_entries, choice_errors, resolve_choice, unmet_prerequisite,
)
from server.rules.classes import active_choices, all_choices, class_detail
from server.rules.common import field_error, is_whole_number, picked_values
from server.rules.details import answer_errors, details_errors
from server.rules.problems import campaign_problems
from server.rules.scores import SCORE_CAP, apply_increases, parse_spread, source
from server.rules.settings import RULE_CHECKS, starting_level, with_rule_defaults

# What a character may be built from and whether a draft is valid, so the browser never decides what's allowed.
# A Setting is a campaign's allowed content and rules, or the Character Sandbox (allowed None, default rules).

SIZE_CHOICE_PREFIX = '$choice:'
CLASS_CHOICE_PREFIX = 'classChoice:'

# Origin rules a sandbox player picks for themselves, which a campaign's GM sets instead.
PLAYER_RULES = ('customizeOrigin', 'originFeat', 'startingEquipment')

# Proficiencies a character can only gain once, so picking one already gained elsewhere is refused.
ONCE_ONLY_MARKERS = (':skill/', ':tool/', ':language/')

class Setting:
    def __init__(self, allowed_content, stored_rules, questions=None):
        self.allowed = allowed_content
        # The campaign's custom questions, none in the sandbox.
        self.questions = questions or []
        self.rules = with_rule_defaults(stored_rules)
        self.level = starting_level(self.rules)
        self.sandbox = allowed_content is None

    # Applies a sandbox draft's own originRules; campaign rules belong to the GM and stay unchanged.
    def for_draft(self, draft):
        chosen = draft.get('originRules') if isinstance(draft, dict) else None
        if not self.sandbox or not isinstance(chosen, dict):
            return self
        return Setting(None, {key: value for key, value in chosen.items() if key in PLAYER_RULES and RULE_CHECKS[key](value)})

    # Checks an existing character at its own level, so raising the milestone level doesn't make it wrong.
    def at_level(self, level):
        if not is_whole_number(level) or level == self.level:
            return self
        setting = Setting(self.allowed, {}, self.questions)
        setting.rules, setting.level = self.rules, level
        return setting

    def origin_rules(self):
        return {key: self.rules[key] for key in PLAYER_RULES}

def allowed_species(setting):
    return allowed_entries('species', setting.allowed)

def allowed_backgrounds(setting):
    return allowed_entries('origins', setting.allowed)

def background_detail_for(background_id, setting):
    return background_detail(packs.collection('origins')[background_id], setting.allowed, setting.rules, setting.level)

def allowed_classes(setting):
    return allowed_entries('classes', setting.allowed)

def _trait_view(trait, context):
    return {
        'id': trait['id'],
        'name': trait['name'],
        'shortDescription': trait.get('shortDescription', ''),
        'description': trait.get('description', ''),
        'choices': [resolve_choice(choice, context) for choice in trait.get('choices') or []],
    }

# Everything the wizard shows for a species, with its own and its traits' choices resolved for the setting.
def species_detail(entry, setting):
    context = Context(setting.allowed, setting.level,
                      features={feature['id']: feature for feature in entry.get('subFeatures') or []},
                      feat_prerequisites=setting.rules['featPrerequisites'])
    size = entry.get('creatureSize')
    own_choices = {choice['id']: choice for choice in entry.get('choices') or []}
    size_choice = None
    if isinstance(size, str) and size.startswith(SIZE_CHOICE_PREFIX):
        size_choice = own_choices.get(size[len(SIZE_CHOICE_PREFIX):])
    if size_choice:
        fixed_sizes = []
    else:
        fixed_sizes = [size] if isinstance(size, str) else list(size or [])
    return {
        'id': entry['id'],
        'name': entry['name'],
        'creatureType': entry.get('creatureType'),
        # Empty when the player chooses the size.
        'size': fixed_sizes,
        'speed': entry.get('speed'),
        # Choices of the species itself rather than a trait, such as Human size.
        'choices': [resolve_choice(choice, context) for choice in own_choices.values()],
        'traits': [_trait_view(trait, context) for trait in entry.get('traits', [])],
    }

# The species' own choices, then each trait's.
def species_choices(detail):
    return detail['choices'] + [choice for trait in detail['traits'] for choice in trait['choices']]

def class_detail_for(class_id, setting):
    return class_detail(packs.collection('classes')[class_id], setting.level, setting.allowed,
                        setting.rules['featPrerequisites'])

def _dict_or_empty(value):
    return value if isinstance(value, dict) else {}

# Background picks for switched-on choices, plus the equipment package when the campaign's rule decides it.
def kept_background_choices(draft, setting):
    picks = draft.get('backgroundChoices') or {}
    detail = background_detail_for(draft['background'], setting)
    active_ids = {choice['id'] for choice in active(all_background_choices(detail), picks)}
    kept = {key: value for key, value in picks.items() if key in active_ids}
    if detail['givenEquipment']:
        kept[EQUIPMENT_CHOICE] = detail['givenEquipment']
    return kept

# Class picks for switched-on choices only.
def kept_class_choices(draft, setting):
    picks = draft.get('classChoices') or {}
    active_ids = {choice['id'] for choice in active_choices(class_detail_for(draft['class'], setting), picks)}
    return {key: value for key, value in picks.items() if key in active_ids}

# An error if the id doesn't name an installed entry the setting allows, else None.
def _pick_error(field, entry_id, collection, noun, setting):
    if not entry_id:
        return field_error(field, f'Choose a {noun}.')
    entries = packs.collection(collection)
    if not isinstance(entry_id, str) or entry_id not in entries:
        return field_error(field, f'That {noun} isn’t in any installed pack.')
    if entry_id not in {entry['id'] for entry in allowed_entries(collection, setting.allowed)}:
        return field_error(field, f'This campaign doesn’t allow {entries[entry_id]["name"]}.')
    return None

def _is_once_only(key):
    return isinstance(key, str) and any(marker in key for marker in ONCE_ONLY_MARKERS)

def _duplicate_message(label, first_field):
    source = 'another choice' if ':' in first_field else f'your {first_field}'
    return f'You already have {label} from {source}. Pick something else.'

# Walks picks in wizard order and returns ({key: first field}, errors for later repeats of a once-only proficiency).
# A section is (prefix, choices, picks), or (field, None, ids) for proficiencies given outright.
# Expertise-style (proficientOnly) choices pick from what is taken, so they take nothing themselves.
def _taken(sections):
    taken, errors = {}, []
    for prefix, choices, picks in sections:
        if choices is None:
            for key in picks:
                taken.setdefault(key, prefix)
            continue
        for choice in choices:
            if choice.get('proficientOnly'):
                continue
            field = prefix + choice['id']
            labels = {opt['key']: opt['label'] for opt in choice['options']}
            for key in picked_values(picks.get(choice['id'])):
                if not _is_once_only(key):
                    continue
                if key not in taken:
                    taken[key] = field
                elif taken[key] != field:
                    errors.append(field_error(field, _duplicate_message(labels.get(key, key), taken[key])))
    return taken, errors

# choice id -> the level its feature is gained at, from the class card.
def _choice_levels(detail):
    levels = {}
    features = detail['features'] + [feature for subclass in detail['subclasses'] for feature in subclass['features']]
    for feature in features:
        for choice in feature['choices']:
            levels[choice['id']] = feature['level']
    return levels

# (field, feat id, level gained) for every feat picked in any section.
def _picked_feats(sections, choice_levels):
    feats = packs.collection('feats')
    picked = []
    for prefix, choices, picks in sections:
        if choices is None:
            continue
        for choice in choices:
            for key in picked_values(picks.get(choice['id'])):
                if isinstance(key, str) and key in feats:
                    level = choice_levels.get(choice['id'], 1) if prefix == CLASS_CHOICE_PREFIX else 1
                    picked.append((prefix + choice['id'], key, level))
    return picked

# Errors for picked feats whose prerequisites the finished draft doesn't meet.
# Ability scores, other feats and proficiencies are only known now, while level and Spellcasting are rechecked.
def prerequisite_errors(draft, setting, sections, sources, taken, cls):
    feats = packs.collection('feats')
    choice_levels = _choice_levels(class_detail_for(draft['class'], setting)) if cls else {}
    picked = _picked_feats(sections, choice_levels)
    background_id = draft.get('background')
    background = packs.collection('origins').get(background_id) if isinstance(background_id, str) else None
    background_feat = (background or {}).get('featId')
    proficiencies = {key.lower() for key in taken}
    if cls:
        detail = class_detail_for(cls['id'], setting)
        proficiencies |= {name.lower() for key in ('armor', 'weapons', 'tools') for name in detail[key]}
    errors = []
    for field, feat_id, level in picked:
        # Feats gained earlier or at the same level count, but a feat can't satisfy itself.
        other_feats = {background_feat} | {other_id for other_field, other_id, other_level in picked
                                           if other_level <= level and other_field != field}
        # Scores before this feat: base, background and earlier feats.
        scores, _ = apply_increases(draft.get('abilityScores'), sources, before_level=level)
        facts = Facts(level, bool(cls and cls.get('spellcasting')),
                      scores={ability: entry['total'] for ability, entry in scores.items()},
                      feats=other_feats, proficiencies=proficiencies)
        unmet = unmet_prerequisite(feats[feat_id], facts)
        if unmet:
            errors.append(field_error(field, f'{feats[feat_id]["name"]} requires {unmet}.'))
    return errors

# Every permanent increase source from the draft's picks: the background's, then each feat's at the level gained.
def increase_sources(draft, setting, background_key):
    sources = []
    spread = parse_spread(background_key) if isinstance(background_key, str) else None
    if spread:
        sources.append(source('Background', spread, 1, SCORE_CAP))
    if isinstance(draft.get('class'), str) and draft['class'] in packs.collection('classes'):
        picks = _dict_or_empty(draft.get('classChoices'))
        detail = class_detail_for(draft['class'], setting)
        choice_levels = _choice_levels(detail)
        for choice in active_choices(detail, picks):
            if choice.get('kind') != 'abilityIncrease':
                continue
            spread = parse_spread(picks.get(choice['id']))
            if spread and set(spread) <= set(choice['abilities']):
                sources.append(source(choice['source'], spread, choice_levels.get(choice['id'], 1),
                                      choice['maximum'], CLASS_CHOICE_PREFIX + choice['id']))
    return sources

def validate_draft(draft, setting, rolls=None):
    return check_draft(draft, setting, rolls)['errors']

def _campaign_errors(setting):
    if setting.allowed is None:
        return []
    problems = campaign_problems(setting.allowed)
    if not problems:
        return []
    return [field_error('campaign', 'This campaign’s settings aren’t finished, so characters can’t be '
                                    'made in it yet. Ask your GM. (' + ' '.join(problems) + ')')]

def _check_species(draft, setting, errors, sections):
    problem = _pick_error('species', draft.get('species'), 'species', 'species', setting)
    if problem:
        errors.append(problem)
        return
    choices = species_choices(species_detail(packs.collection('species')[draft['species']], setting))
    errors.extend(choice_errors(draft.get('speciesChoices'), choices, 'choice:', 'species'))
    sections.append(('choice:', choices, _dict_or_empty(draft.get('speciesChoices'))))

def _check_background(draft, setting, errors, sections):
    problem = _pick_error('background', draft.get('background'), 'origins', 'background', setting)
    if problem:
        errors.append(problem)
        return
    picks = _dict_or_empty(draft.get('backgroundChoices'))
    detail = background_detail_for(draft['background'], setting)
    active_background_choices = active(all_background_choices(detail), picks)
    # A package pick left from before the campaign's rule decided it is ignored rather than refused.
    known_ids = {choice['id'] for choice in all_background_choices(detail)} | {EQUIPMENT_CHOICE}
    errors.extend(choice_errors(draft.get('backgroundChoices'), active_background_choices, 'backgroundChoice:',
                                'background', known=known_ids))
    # The ability boxes save as the player goes, so a half-spent spread gets a clearer message.
    ability_field = 'backgroundChoice:' + ABILITY_CHOICE
    for error in errors:
        if error['field'] == ability_field and picks.get(ABILITY_CHOICE):
            error['message'] = (f'Spend all {ABILITY_POINTS} points, at most +{ABILITY_MAX} to one ability: '
                                f'+2 to one and +1 to another, or +1 to three.')
    sections.append(('background', None, detail['fixed']))
    sections.append(('backgroundChoice:', active_background_choices, picks))

def _check_class(draft, setting, errors, sections):
    problem = _pick_error('class', draft.get('class'), 'classes', 'class', setting)
    if problem:
        errors.append(problem)
        return
    picks = _dict_or_empty(draft.get('classChoices'))
    detail = class_detail_for(draft['class'], setting)
    class_choices = active_choices(detail, picks)
    sections.append((CLASS_CHOICE_PREFIX, class_choices, picks))
    proficient_skills = frozenset(key for key in _taken(sections)[0] if ':skill/' in key)
    errors.extend(choice_errors(draft.get('classChoices'), class_choices, CLASS_CHOICE_PREFIX, 'class',
                                proficient=proficient_skills, known={choice['id'] for choice in all_choices(detail)}))

def _name_errors(name):
    if not isinstance(name, str) or not name.strip():
        return [field_error('name', 'Give your character a name.')]
    if clean_name(name) is None:
        return [field_error('name', f'Name must be 1-{NAME_MAX_LENGTH} characters, with no control characters.')]
    return []

# Every problem with a draft as [{field, message}], plus taken and summary.
# taken maps each once-only proficiency to the field that picked it, so the wizard can hide it elsewhere.
# summary holds the ability scores and hit points as far as they can be worked out yet.
# rolls are the draft's server-rolled ability scores, or None if not rolled.
def check_draft(draft, setting, rolls=None):
    setting = setting.for_draft(draft)
    errors = _campaign_errors(setting)
    sections = []
    _check_species(draft, setting, errors, sections)
    _check_background(draft, setting, errors, sections)
    _check_class(draft, setting, errors, sections)

    errors.extend(ability_errors(draft, setting, rolls))
    background_picks = draft.get('backgroundChoices')
    background_increase = background_picks.get(ABILITY_CHOICE) if isinstance(background_picks, dict) else None
    sources = increase_sources(draft, setting, background_increase)
    scores, overflow = apply_increases(draft.get('abilityScores'), sources)
    for increase_source, ability in overflow:
        if increase_source['field']:
            errors.append(field_error(increase_source['field'],
                                      f'{increase_source["name"]} can’t raise {ABILITY_NAMES[ability]} above '
                                      f'{increase_source["maximum"]}. Put the increase somewhere else.'))
    class_id = draft.get('class')
    cls = packs.collection('classes').get(class_id) if isinstance(class_id, str) else None
    hit_die = cls.get('hitDie') if cls else None
    class_picks = _dict_or_empty(draft.get('classChoices'))
    errors.extend(hp_errors(draft, setting, hit_die))
    hp = hit_points(hit_die, setting.level, scores['CON']['modifier'], hp_method(draft, setting), draft.get('hpRolls'),
                    hp_bonuses(hp_features(draft.get('species'), class_picks.get('subclass')), setting.level))

    taken, repeat_errors = _taken(sections)
    if setting.rules['featPrerequisites']:
        errors.extend(prerequisite_errors(draft, setting, sections, sources, taken, cls))
    flagged_fields = {error['field'] for error in errors}
    errors.extend(error for error in repeat_errors if error['field'] not in flagged_fields)

    errors.extend(details_errors(draft.get('details')))
    errors.extend(answer_errors(draft.get('answers'), setting.questions))
    errors.extend(_name_errors(draft.get('name')))
    return {'errors': errors, 'taken': taken, 'summary': {'abilities': scores, 'hitPoints': hp}}
