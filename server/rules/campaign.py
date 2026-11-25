from server.helpers import NAME_MAX_LENGTH, clean_name
from server.records import record_problems
from server.rules import packs
from server.rules.settings import RULE_CHECKS

CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000
PATCH_FIELDS = {'name', 'description', 'rules', 'allowedContent', 'questions'}
# Without species, backgrounds or classes no character can be made.
REQUIRED_COLLECTIONS = ('species', 'origins', 'classes')

def _rules_problem(rules):
    if not isinstance(rules, dict) or not rules:
        return 'rules must be a non-empty object.'
    for key, value in rules.items():
        is_valid = RULE_CHECKS.get(key)
        if is_valid is None:
            return f'Unknown rule: {key}'
        if not is_valid(value):
            return f'Invalid value for {key}.'
    return None

def _questions_problem(questions):
    problems = record_problems('campaign-settings', {'questions': questions})
    if problems:
        return f'Invalid questions: {problems[0]}'
    if any(not question['prompt'].strip() for question in questions):
        return 'Every question needs a prompt.'
    if len({question['id'] for question in questions}) != len(questions):
        return 'Question ids must be unique.'
    return None

def _allowed_content_problem(allowed):
    if not isinstance(allowed, dict) or not allowed:
        return 'allowedContent must be a non-empty object.'
    installed = packs.collection_names() - {'pack'}
    for collection, entry_ids in allowed.items():
        if collection not in installed:
            return f'Unknown collection: {collection}'
        if entry_ids is not None and not (isinstance(entry_ids, list) and all(isinstance(i, str) for i in entry_ids)):
            return 'ids must be null or a list of strings.'
        if collection in REQUIRED_COLLECTIONS and entry_ids == []:
            return f'At least one entry in {collection} must stay allowed.'
    return None

# An error message for a campaign PATCH body, or None if every field is valid.
# rules merge into the saved rules, while questions replace the saved list.
def validate_campaign_patch(content):
    if not isinstance(content, dict) or not content:
        return 'Body must be a non-empty object.'
    unknown_fields = set(content) - PATCH_FIELDS
    if unknown_fields:
        return f'Unknown field: {sorted(unknown_fields)[0]}'
    if 'name' in content and clean_name(content['name']) is None:
        return f'Name must be 1–{NAME_MAX_LENGTH} characters.'
    if 'description' in content:
        description = content['description']
        if not isinstance(description, str) or len(description) > CAMPAIGN_DESCRIPTION_MAX_LENGTH:
            return f'Description must be at most {CAMPAIGN_DESCRIPTION_MAX_LENGTH} characters.'
    if 'rules' in content:
        problem = _rules_problem(content['rules'])
        if problem:
            return problem
    if 'questions' in content:
        problem = _questions_problem(content['questions'])
        if problem:
            return problem
    if 'allowedContent' in content:
        return _allowed_content_problem(content['allowedContent'])
    return None

# Narrows each id list to installed entries in pack order, so removed or mistyped ids aren't stored.
def known_content(changes):
    result = {}
    for collection, entry_ids in changes.items():
        if entry_ids is None:
            result[collection] = None
        else:
            wanted = set(entry_ids)
            result[collection] = [entry_id for entry_id in packs.collection(collection) if entry_id in wanted]
    return result
