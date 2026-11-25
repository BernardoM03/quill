from server.records import definition

# A character's description fields are optional free text, except alignment which must be one of ALIGNMENTS.

ANSWER_MAX_LENGTH = 2000

# Reads each field's max length and the alignments from common.schema.json $defs.details.
def _load_detail_fields():
    max_lengths, alignments = {}, []
    for key, field in definition('common', 'details')['properties'].items():
        if 'enum' in field:
            alignments = [alignment for alignment in field['enum'] if alignment]
            max_lengths[key] = max(len(alignment) for alignment in alignments)
        else:
            text_schema = definition('common', field['$ref'].rsplit('/', 1)[-1]) if '$ref' in field else field
            max_lengths[key] = text_schema['maxLength']
    return max_lengths, alignments

FIELDS, ALIGNMENTS = _load_detail_fields()

def _error(field, message):
    return {'field': field, 'message': message}

# Problems with draft['details'], using fields named 'details:<key>'.
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

# Known, non-blank detail fields, trimmed.
def clean_details(details):
    if not isinstance(details, dict):
        return {}
    return {key: value.strip() for key, value in details.items()
            if key in FIELDS and isinstance(value, str) and value.strip()}

# Problems with draft['answers'], using fields named 'answer:<id>'.
# Required questions need a non-blank answer, and answers to removed questions are ignored.
def answer_errors(answers, questions):
    if answers is not None and not isinstance(answers, dict):
        return [_error('answers', 'Answers must be an object.')]
    answers = answers or {}
    errors = []
    for question in questions:
        field = f'answer:{question["id"]}'
        value = answers.get(question['id'])
        if value is not None and not isinstance(value, str):
            errors.append(_error(field, 'Must be text.'))
        elif value and len(value) > ANSWER_MAX_LENGTH:
            errors.append(_error(field, f'At most {ANSWER_MAX_LENGTH} characters.'))
        elif question['required'] and not (value or '').strip():
            errors.append(_error(field, 'Your GM needs an answer to this.'))
    return errors

# Non-blank answers to the current questions, trimmed.
# Saved answers to questions no longer asked are kept, so a restored question finds its answer.
def clean_answers(answers, questions, previous_answers=None):
    asked = {question['id'] for question in questions}
    kept = {key: value for key, value in (previous_answers or {}).items() if key not in asked}
    if isinstance(answers, dict):
        kept.update({key: value.strip() for key, value in answers.items()
                     if key in asked and isinstance(value, str) and value.strip()})
    return kept
