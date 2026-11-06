from server.rules import packs
from server.helpers import NAME_MAX_LENGTH, clean_name
from server.rules.settings import RULE_CHECKS

CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000

# Checks a campaign PATCH body. Returns an error message, or None if every field is valid.
def validate_campaign_patch(content):
    if not isinstance(content, dict) or not content:
        return 'Body must be a non-empty object.'
    unknown = set(content) - {'name', 'description', 'rules', 'allowedContent'}
    if unknown:
        return f'Unknown field: {sorted(unknown)[0]}'
    if 'name' in content and clean_name(content['name']) is None:
        return f'Name must be 1–{NAME_MAX_LENGTH} characters.'
    if 'description' in content:
        description = content['description']
        if not isinstance(description, str) or len(description) > CAMPAIGN_DESCRIPTION_MAX_LENGTH:
            return f'Description must be at most {CAMPAIGN_DESCRIPTION_MAX_LENGTH} characters.'
    if 'rules' in content:
        # rules holds only the rules being changed; they merge into the saved rules.
        rules = content['rules']
        if not isinstance(rules, dict) or not rules:
            return 'rules must be a non-empty object.'
        for key, value in rules.items():
            check = RULE_CHECKS.get(key)
            if check is None:
                return f'Unknown rule: {key}'
            if not check(value):
                return f'Invalid value for {key}.'
    if 'allowedContent' in content:
        # {collection: ids}. ids is a list of pack ids, or null for "everything allowed".
        # Only installed collections; ids are kept to installed entries (known_content), so
        # what's stored can't outgrow the packs.
        allowed = content['allowedContent']
        if not isinstance(allowed, dict) or not allowed:
            return 'allowedContent must be a non-empty object.'
        installed = packs.collection_names() - {'pack'}
        for collection, ids in allowed.items():
            if collection not in installed:
                return f'Unknown collection: {collection}'
            if ids is not None and not (isinstance(ids, list) and all(isinstance(i, str) for i in ids)):
                return 'ids must be null or a list of strings.'
            # A campaign with no species or no classes can't make characters.
            if collection in ('species', 'origins', 'classes') and ids == []:
                return f'At least one entry in {collection} must stay allowed.'
    return None

# A checked allowedContent change with each list kept to entries installed packs have
# (in pack order), so ids from removed packs or typos aren't stored.
def known_content(changes):
    result = {}
    for collection, ids in changes.items():
        if ids is None:
            result[collection] = None
        else:
            wanted = set(ids)
            result[collection] = [i for i in packs.collection(collection) if i in wanted]
    return result
