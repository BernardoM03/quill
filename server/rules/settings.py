import json
import os

# Campaign rules come from campaign-settings.schema.json $defs.rules, so edit the schema to add or change one.
# A campaign stores only the rules its GM changed, and everything else uses these defaults.

SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                           'schemas', 'records', 'campaign-settings.schema.json')

# Keywords fits_schema understands; any other keyword is refused at startup rather than silently skipped.
SUPPORTED_KEYWORDS = {'description', 'default', 'type', 'enum', 'minimum', 'maximum', 'items', 'minItems', 'maxItems'}

def _load_rule_schemas():
    with open(SCHEMA_PATH, encoding='utf-8') as f:
        schema = json.load(f)
    rules = schema['$defs']['rules']['properties']
    for name, rule in rules.items():
        for part in (rule, rule.get('items') or {}):
            unsupported = set(part) - SUPPORTED_KEYWORDS
            if unsupported:
                raise ValueError(f'campaign-settings.schema.json: rule {name} uses unsupported {sorted(unsupported)}')
        if 'default' not in rule:
            raise ValueError(f'campaign-settings.schema.json: rule {name} has no default')
    return rules

RULE_SCHEMAS = _load_rule_schemas()

def _is_number(value):
    return isinstance(value, (int, float))

# Whether value fits a rule's schema, using only SUPPORTED_KEYWORDS.
def fits_schema(schema, value):
    value_type = schema.get('type')
    if value_type == 'boolean' and not isinstance(value, bool):
        return False
    if value_type == 'integer' and (not isinstance(value, int) or isinstance(value, bool)):
        return False
    if value_type == 'array' and not isinstance(value, list):
        return False
    if 'enum' in schema and value not in schema['enum']:
        return False
    if 'minimum' in schema and not (_is_number(value) and value >= schema['minimum']):
        return False
    if 'maximum' in schema and not (_is_number(value) and value <= schema['maximum']):
        return False
    if isinstance(value, list):
        if len(value) < schema.get('minItems', 0) or len(value) > schema.get('maxItems', len(value)):
            return False
        if 'items' in schema and not all(fits_schema(schema['items'], item) for item in value):
            return False
    return True

RULE_DEFAULTS = {name: rule['default'] for name, rule in RULE_SCHEMAS.items()}
# Rule name -> predicate on a value; the default argument binds each schema at definition time.
RULE_CHECKS = {name: (lambda value, schema=rule: fits_schema(schema, value)) for name, rule in RULE_SCHEMAS.items()}

def _range(schema):
    return {'min': schema['minimum'], 'max': schema['maximum']}

# Sent to the browser as ruleLimits, so the settings page offers exactly what the server accepts.
LIMITS = {
    'maxLevel': RULE_SCHEMAS['milestoneLevel']['maximum'],
    'pointBuyBudget': _range(RULE_SCHEMAS['pointBuyBudget']),
    'sharedScore': _range(RULE_SCHEMAS['sharedScores']['items']),
}
MAX_LEVEL = LIMITS['maxLevel']

# Stored rule changes over fresh copies of the defaults, dropping rules no longer known.
def with_rule_defaults(stored):
    rules = {key: (list(value) if isinstance(value, list) else value) for key, value in RULE_DEFAULTS.items()}
    rules.update({key: value for key, value in (stored or {}).items() if key in RULE_DEFAULTS})
    return rules

def starting_level(rules):
    return rules['milestoneLevel'] if rules['advancement'] == 'milestone' else 1
