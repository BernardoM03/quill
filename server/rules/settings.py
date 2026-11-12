# Campaign rules: their defaults, limits and checks, all read from one place,
# schemas/records/campaign-settings.schema.json ($defs.rules). To add or change a rule,
# edit the schema; the server, the settings page's limits and the TypeScript type
# (npm run gen-types) follow from it. A campaign stores just the rules its GM changed;
# everything else uses these defaults, and so does the Character Sandbox.

import json
import os

SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                           'schemas', 'records', 'campaign-settings.schema.json')

# The keywords check() understands. Anything else in a rule's schema is refused at startup,
# so a schema can't add a constraint the server would silently skip.
SUPPORTED = {'description', 'default', 'type', 'enum', 'minimum', 'maximum', 'items', 'minItems', 'maxItems'}

def _load_rule_schemas():
    with open(SCHEMA_PATH, encoding='utf-8') as f:
        schema = json.load(f)
    rules = schema['$defs']['rules']['properties']
    for name, rule in rules.items():
        for part in (rule, rule.get('items') or {}):
            unknown = set(part) - SUPPORTED
            if unknown:
                raise ValueError(f'campaign-settings.schema.json: rule {name} uses unsupported {sorted(unknown)}')
        if 'default' not in rule:
            raise ValueError(f'campaign-settings.schema.json: rule {name} has no default')
    return rules

RULE_SCHEMAS = _load_rule_schemas()

# Whether value fits a rule's schema (the subset of JSON Schema in SUPPORTED).
def check(schema, value):
    kind = schema.get('type')
    if kind == 'boolean' and not isinstance(value, bool):
        return False
    if kind == 'integer' and (not isinstance(value, int) or isinstance(value, bool)):
        return False
    if kind == 'array' and not isinstance(value, list):
        return False
    if 'enum' in schema and value not in schema['enum']:
        return False
    if 'minimum' in schema and not (isinstance(value, (int, float)) and value >= schema['minimum']):
        return False
    if 'maximum' in schema and not (isinstance(value, (int, float)) and value <= schema['maximum']):
        return False
    if isinstance(value, list):
        if len(value) < schema.get('minItems', 0) or len(value) > schema.get('maxItems', len(value)):
            return False
        if 'items' in schema and not all(check(schema['items'], v) for v in value):
            return False
    return True

RULE_DEFAULTS = {name: rule['default'] for name, rule in RULE_SCHEMAS.items()}
# Each rule's check: rule name -> function(value) -> bool.
RULE_CHECKS = {name: (lambda v, s=rule: check(s, v)) for name, rule in RULE_SCHEMAS.items()}

def _range(schema):
    return {'min': schema['minimum'], 'max': schema['maximum']}

# Sent to the browser as ruleLimits, so the settings page offers exactly what the server accepts.
LIMITS = {
    'maxLevel': RULE_SCHEMAS['milestoneLevel']['maximum'],
    'pointBuyBudget': _range(RULE_SCHEMAS['pointBuyBudget']),
    'sharedScore': _range(RULE_SCHEMAS['sharedScores']['items']),
}
MAX_LEVEL = LIMITS['maxLevel']

# The full rules: the stored changes over the defaults. Rules no longer known are dropped.
def with_rule_defaults(stored):
    rules = {key: (list(value) if isinstance(value, list) else value) for key, value in RULE_DEFAULTS.items()}
    rules.update({key: value for key, value in (stored or {}).items() if key in RULE_DEFAULTS})
    return rules

# The level a new character starts at under these rules.
def starting_level(rules):
    return rules['milestoneLevel'] if rules['advancement'] == 'milestone' else 1
