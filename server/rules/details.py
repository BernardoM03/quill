# A character's description: who they are, how they look, their personality, and notes.
# Every field is optional free text, except alignment, which is one of ALIGNMENTS.

from server.records import definition

# The fields, their limits and the alignments come from the schema
# (schemas/records/common.schema.json $defs.details), the source of truth for them.
def _fields():
    fields, alignments = {}, []
    for key, field in definition('common', 'details')['properties'].items():
        if 'enum' in field:
            alignments = [a for a in field['enum'] if a]
            fields[key] = max(len(a) for a in alignments)
        else:
            text = definition('common', field['$ref'].rsplit('/', 1)[-1]) if '$ref' in field else field
            fields[key] = text['maxLength']
    return fields, alignments

# Field -> its longest length. alignment is checked against ALIGNMENTS instead.
FIELDS, ALIGNMENTS = _fields()

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
