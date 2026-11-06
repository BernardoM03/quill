# Character rules: what a new character may be built from, and whether a draft is valid.
# The creation wizard shows these errors as the player goes, and creating a character
# runs the same checks, so the browser never decides what's allowed.
#
# A "setting" is where the character is made: a campaign's allowedContent and rules, or
# the Character Sandbox (allowed None: everything installed; the default rules).

from server.helpers import NAME_MAX_LENGTH, clean_name
from server.rules import packs
from server.rules.abilities import (
    ability_errors, hit_points, hp_bonuses, hp_errors, hp_features, hp_method,
)
from server.rules.backgrounds import ABILITY_CHOICE, ABILITY_MAX, ABILITY_POINTS, EQUIPMENT_CHOICE, all_background_choices, background_detail
from server.rules.choices import ABILITY_NAMES, Context, Facts, active, allowed_entries, choice_errors, resolve_choice, unmet_prerequisite
from server.rules.classes import active_choices, all_choices, class_detail
from server.rules.settings import RULE_CHECKS
from server.rules.details import details_errors
from server.rules.problems import campaign_problems
from server.rules.scores import SCORE_CAP, apply_increases, parse_spread, source
from server.rules.settings import starting_level, with_rule_defaults

SIZE_CHOICE_PREFIX = '$choice:'

# Origin rules a Character Sandbox player picks for themselves (a campaign's GM sets them).
# The ability score and hit point methods are picked the same way, as draft fields of their own.
PLAYER_RULES = ('customizeOrigin', 'originFeat', 'startingEquipment')

class Setting:
    def __init__(self, allowed_content, stored_rules):
        self.allowed = allowed_content
        self.rules = with_rule_defaults(stored_rules)
        # A new character's level: the campaign's milestone level, else 1.
        self.level = starting_level(self.rules)
        self.sandbox = allowed_content is None

    # The setting with a sandbox draft's own origin rules (originRules) applied. A campaign's
    # rules are its GM's, so there it's unchanged.
    def for_draft(self, draft):
        chosen = draft.get('originRules') if isinstance(draft, dict) else None
        if not self.sandbox or not isinstance(chosen, dict):
            return self
        return Setting(None, {k: v for k, v in chosen.items() if k in PLAYER_RULES and RULE_CHECKS[k](v)})

    # The setting for an existing character, checked at the level it has rather than the
    # campaign's starting level (raising the milestone level doesn't make it wrong).
    def at_level(self, level):
        if not isinstance(level, int) or isinstance(level, bool) or level == self.level:
            return self
        setting = Setting(self.allowed, {})
        setting.rules, setting.level = self.rules, level
        return setting

    # The origin rules in force, for the wizard and the saved sheet.
    def origin_rules(self):
        return {k: self.rules[k] for k in PLAYER_RULES}

def allowed_species(setting):
    return allowed_entries('species', setting.allowed)

def allowed_backgrounds(setting):
    return allowed_entries('origins', setting.allowed)

def background_detail_for(background_id, setting):
    return background_detail(packs.collection('origins')[background_id], setting.allowed, setting.rules, setting.level)

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

# The background picks worth keeping: those for choices that are switched on, plus the
# starting equipment package when the campaign's rule decides it.
def kept_background_choices(draft, setting):
    picks = draft.get('backgroundChoices') or {}
    detail = background_detail_for(draft['background'], setting)
    on = {c['id'] for c in active(all_background_choices(detail), picks)}
    kept = {k: v for k, v in picks.items() if k in on}
    if detail['givenEquipment']:
        kept[EQUIPMENT_CHOICE] = detail['givenEquipment']
    return kept

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

# Proficiencies a character can only have once: picking one already gained elsewhere is refused.
ONCE_ONLY = (':skill/', ':tool/', ':language/')

def _values(value):
    return value if isinstance(value, list) else ([] if value in (None, '') else [value])

# Walks the picks in wizard order (species, background, class) and returns ({key: field},
# errors): every once-only proficiency the draft has, with the field that gave it first, and an
# error for each later choice that picks it again. Expertise-style choices pick from these, so
# they take nothing. A section is (prefix, choices, picks), or (field, None, ids) for
# proficiencies given outright (a background's skills).
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
            labels = {o['key']: o['label'] for o in choice['options']}
            for key in _values(picks.get(choice['id'])):
                if not isinstance(key, str) or not any(t in key for t in ONCE_ONLY):
                    continue
                if key not in taken:
                    taken[key] = field
                elif taken[key] != field:
                    source = taken[key] if ':' not in taken[key] else 'another choice'
                    source = f'your {source}' if source != 'another choice' else source
                    errors.append(_error(field, f'You already have {labels.get(key, key)} from {source}. '
                                                f'Pick something else.'))
    return taken, errors

# The level each class choice is gained at, from the class card: choice id -> level.
def _choice_levels(detail):
    levels = {}
    for f in detail['features'] + [f for s in detail['subclasses'] for f in s['features']]:
        for c in f['choices']:
            levels[c['id']] = f['level']
    return levels

# Errors for feats picked whose prerequisites the finished draft doesn't meet: ability
# scores (known only once scores are set), other feats, and proficiencies. Level and
# Spellcasting are already left out of the options, but are checked again here.
def prerequisite_errors(draft, setting, sections, sources, taken, cls):
    feats = packs.collection('feats')
    picked = []  # (field, feat id, level gained at)
    levels = _choice_levels(class_detail_for(draft['class'], setting)) if cls else {}
    for prefix, choices, picks in sections:
        if choices is None:
            continue
        for choice in choices:
            for key in _values(picks.get(choice['id'])):
                if isinstance(key, str) and key in feats:
                    level = levels.get(choice['id'], 1) if prefix == 'classChoice:' else 1
                    picked.append((prefix + choice['id'], key, level))
    background = packs.collection('origins').get(draft.get('background')) if isinstance(draft.get('background'), str) else None
    own_feat = (background or {}).get('featId')
    proficiencies = {k.lower() for k in taken}
    if cls:
        detail = class_detail_for(cls['id'], setting)
        proficiencies |= {n.lower() for key in ('armor', 'weapons', 'tools') for n in detail[key]}
    errors = []
    for field, feat_id, level in picked:
        # Feats gained earlier (or at the same level, from origin) count; a feat can't satisfy itself.
        others = {own_feat} | {f for fl, f, lv in picked if lv <= level and fl != field}
        # Scores as they are before this feat: base, the background, and earlier feats.
        scores, _ = apply_increases(draft.get('abilityScores'), sources, before_level=level)
        facts = Facts(level, bool(cls and cls.get('spellcasting')),
                      scores={a: v['total'] for a, v in scores.items()},
                      feats=others, proficiencies=proficiencies)
        unmet = unmet_prerequisite(feats[feat_id], facts)
        if unmet:
            errors.append(_error(field, f'{feats[feat_id]["name"]} requires {unmet}.'))
    return errors

# Every permanent increase the draft's picks give, as scores.source()s: the background's,
# then each feat's (Ability Score Improvement at 4, 8, ...) at the level it's gained.
def increase_sources(draft, setting, background_key):
    sources = []
    spread = parse_spread(background_key) if isinstance(background_key, str) else None
    if spread:
        sources.append(source('Background', spread, 1, SCORE_CAP))
    if isinstance(draft.get('class'), str) and draft['class'] in packs.collection('classes'):
        picks = draft.get('classChoices') if isinstance(draft.get('classChoices'), dict) else {}
        detail = class_detail_for(draft['class'], setting)
        levels = _choice_levels(detail)
        for choice in active_choices(detail, picks):
            if choice.get('kind') != 'abilityIncrease':
                continue
            spread = parse_spread(picks.get(choice['id']))
            if spread and set(spread) <= set(choice['abilities']):
                sources.append(source(choice['source'], spread, levels.get(choice['id'], 1),
                                      choice['maximum'], 'classChoice:' + choice['id']))
    return sources

# Every problem with a draft, as [{field, message}]; empty when it can be created.
# draft: {name, species, speciesChoices, background, backgroundChoices, class, classChoices};
# choices map choice id -> key(s). Fields: 'campaign', 'species', 'choice:<id>', 'background',
# 'backgroundChoice:<id>', 'class', 'classChoice:<id>', 'name'.
def validate_draft(draft, setting, rolls=None):
    return check_draft(draft, setting, rolls)['errors']

# validate_draft's errors, plus taken: {option key: field} for each once-only proficiency
# the draft has picked, so the wizard can leave it out of every other choice; and summary:
# the final ability scores and hit points as far as they can be worked out yet.
# rolls: the draft's server-rolled ability scores, for the roll method (None if not rolled).
# Fields also include 'abilityMethod', 'abilityScores', 'hpMethod', 'hpRolls', 'details:<key>'.
def check_draft(draft, setting, rolls=None):
    setting = setting.for_draft(draft)
    errors = []
    sections = []
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
        picks = draft.get('speciesChoices')
        sections.append(('choice:', species_choice_list, picks if isinstance(picks, dict) else {}))

    problem = _pick_error('background', draft.get('background'), 'origins', 'background', setting)
    if problem:
        errors.append(problem)
    else:
        picks = draft.get('backgroundChoices') if isinstance(draft.get('backgroundChoices'), dict) else {}
        detail = background_detail_for(draft['background'], setting)
        on = active(all_background_choices(detail), picks)
        errors.extend(choice_errors(draft.get('backgroundChoices'), on, 'backgroundChoice:', 'background',
                                    # A package pick left from before the campaign's rule decided it is ignored.
                                    known={c['id'] for c in all_background_choices(detail)} | {EQUIPMENT_CHOICE}))
        # The ability boxes save as the player goes, so a spread can be half done.
        ability_field = 'backgroundChoice:' + ABILITY_CHOICE
        for e in errors:
            if e['field'] == ability_field and picks.get(ABILITY_CHOICE):
                e['message'] = (f'Spend all {ABILITY_POINTS} points, at most +{ABILITY_MAX} to one ability: '
                                f'+2 to one and +1 to another, or +1 to three.')
        sections.append(('background', None, detail['fixed']))
        sections.append(('backgroundChoice:', on, picks))

    problem = _pick_error('class', draft.get('class'), 'classes', 'class', setting)
    if problem:
        errors.append(problem)
    else:
        picks = draft.get('classChoices') if isinstance(draft.get('classChoices'), dict) else {}
        detail = class_detail_for(draft['class'], setting)
        class_choices = active_choices(detail, picks)
        sections.append(('classChoice:', class_choices, picks))
        proficient = frozenset(k for k in _taken(sections)[0] if ':skill/' in k)
        errors.extend(choice_errors(draft.get('classChoices'), class_choices, 'classChoice:', 'class',
                                    proficient=proficient, known={c['id'] for c in all_choices(detail)}))

    errors.extend(ability_errors(draft, setting, rolls))
    increase = (draft.get('backgroundChoices') or {}).get(ABILITY_CHOICE) if isinstance(draft.get('backgroundChoices'), dict) else None
    sources = increase_sources(draft, setting, increase)
    scores, overflow = apply_increases(draft.get('abilityScores'), sources)
    for s, a in overflow:
        if s['field']:
            errors.append(_error(s['field'], f'{s["name"]} can’t raise {ABILITY_NAMES[a]} above {s["maximum"]}. '
                                             f'Put the increase somewhere else.'))
    cls = packs.collection('classes').get(draft.get('class')) if isinstance(draft.get('class'), str) else None
    hit_die = cls.get('hitDie') if cls else None
    class_picks = draft.get('classChoices') if isinstance(draft.get('classChoices'), dict) else {}
    errors.extend(hp_errors(draft, setting, hit_die))
    hp = hit_points(hit_die, setting.level, scores['CON']['modifier'], hp_method(draft, setting), draft.get('hpRolls'),
                    hp_bonuses(hp_features(draft.get('species'), class_picks.get('subclass')), setting.level))

    taken, repeats = _taken(sections)
    if setting.rules['featPrerequisites']:
        errors.extend(prerequisite_errors(draft, setting, sections, sources, taken, cls))
    flagged = {e['field'] for e in errors}
    errors.extend(e for e in repeats if e['field'] not in flagged)

    errors.extend(details_errors(draft.get('details')))
    name = draft.get('name')
    if not isinstance(name, str) or not name.strip():
        errors.append(_error('name', 'Give your character a name.'))
    elif clean_name(name) is None:
        errors.append(_error('name', f'Name must be 1-{NAME_MAX_LENGTH} characters, with no control characters.'))
    return {'errors': errors, 'taken': taken, 'summary': {'abilities': scores, 'hitPoints': hp}}
