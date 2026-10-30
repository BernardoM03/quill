import re

from server.helpers import NAME_MAX_LENGTH, clean_name

CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000
# Caps on allowedContent so one request can't bloat the database.
ALLOWED_COLLECTIONS_MAX = 32
ALLOWED_IDS_MAX = 2000
ALLOWED_ID_MAX_LENGTH = 200

# Each rule's check. Mirrors src/datatypes/campaignRules.ts.
def is_bool(v): return isinstance(v, bool)
RULE_CHECKS = {
    'optionalClassFeatures': is_bool,
    'customizeOrigin': is_bool,
    'advancement': lambda v: v in ('xp', 'milestone'),
    'milestoneLevel': lambda v: isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 20,
    'hitPoints': lambda v: v in ('automatic', 'manual'),
    'featPrerequisites': is_bool,
    'multiclassPrerequisites': is_bool,
    'encumbrance': is_bool,
    'ignoreCoinWeight': is_bool,
    'allowMulticlass': is_bool,
    'abilityScoreMethod': lambda v: v in ('standardArray', 'pointBuy', 'roll', 'manual', 'sharedManual'),
    'sharedScores': lambda v: isinstance(v, list) and len(v) == 6
        and all(isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 20 for n in v),
    'pointBuyBudget': lambda v: isinstance(v, int) and not isinstance(v, bool) and 15 <= v <= 40,
    'startingEquipment': lambda v: v in ('choice', 'equipment', 'gold'),
    'originFeat': lambda v: v in ('background', 'any'),
    'characterApproval': is_bool,
}

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
        allowed = content['allowedContent']
        if not isinstance(allowed, dict) or not allowed:
            return 'allowedContent must be a non-empty object.'
        if len(allowed) > ALLOWED_COLLECTIONS_MAX:
            return f'allowedContent may have at most {ALLOWED_COLLECTIONS_MAX} collections.'
        for collection, ids in allowed.items():
            if not re.fullmatch(r'[a-z-]{1,64}', collection):
                return 'Invalid collection.'
            if ids is not None and not (
                isinstance(ids, list) and len(ids) <= ALLOWED_IDS_MAX
                and all(isinstance(i, str) and len(i) <= ALLOWED_ID_MAX_LENGTH for i in ids)
            ):
                return f'ids must be null or a list of at most {ALLOWED_IDS_MAX} strings.'
            # A campaign with no species or no classes can't make characters.
            if collection in ('species', 'classes') and ids == []:
                return f'At least one entry in {collection} must stay allowed.'
    return None
