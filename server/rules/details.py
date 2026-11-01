# A character's description: who they are, how they look, their personality, and notes.
# Every field is optional free text, except alignment, which is one of ALIGNMENTS.

SHORT_MAX = 100
LONG_MAX = 5000
ALIGNMENTS = [
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
]
# Field -> its longest length. alignment is checked against ALIGNMENTS instead.
FIELDS = {
    # Character details
    'alignment': SHORT_MAX, 'faith': SHORT_MAX, 'lifestyle': SHORT_MAX,
    # Physical characteristics
    'gender': SHORT_MAX, 'age': SHORT_MAX, 'height': SHORT_MAX, 'weight': SHORT_MAX,
    'hair': SHORT_MAX, 'eyes': SHORT_MAX, 'skin': SHORT_MAX, 'appearance': LONG_MAX,
    # Personal characteristics
    'personalityTraits': LONG_MAX, 'ideals': LONG_MAX, 'bonds': LONG_MAX, 'flaws': LONG_MAX,
    # Notes
    'organizations': LONG_MAX, 'allies': LONG_MAX, 'enemies': LONG_MAX, 'backstory': LONG_MAX, 'other': LONG_MAX,
}

def _error(field, message):
    return {'field': field, 'message': message}

# Problems with draft['details'], fields 'details:<key>'.
def details_errors(details):
    if details is None:
        return []
    if not isinstance(details, dict):
        return [_error('details', 'Details must be an object.')]
    errors = []
    for key, value in details.items():
        if key not in FIELDS:
            errors.append(_error('details', f'Unknown detail: {key}'))
        elif not isinstance(value, str):
            errors.append(_error(f'details:{key}', 'Must be text.'))
        elif len(value) > FIELDS[key]:
            errors.append(_error(f'details:{key}', f'At most {FIELDS[key]} characters.'))
        elif key == 'alignment' and value and value not in ALIGNMENTS:
            errors.append(_error('details:alignment', 'Choose one of the alignments.'))
    return errors

# The details worth saving: known fields, trimmed, without the empty ones.
def clean_details(details):
    if not isinstance(details, dict):
        return {}
    return {k: v.strip() for k, v in details.items() if k in FIELDS and isinstance(v, str) and v.strip()}
