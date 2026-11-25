import json
import os

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

# Validates stored records (drafts, sheets, campaign settings) against schemas/records/*.schema.json.

RECORDS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'schemas', 'records')
BASE_URL = 'https://quill.local/schemas/records/'
SCHEMA_SUFFIX = '.schema.json'

def _load_schemas():
    schemas = {}
    for file_name in sorted(os.listdir(RECORDS_DIR)):
        if file_name.endswith(SCHEMA_SUFFIX):
            with open(os.path.join(RECORDS_DIR, file_name), encoding='utf-8') as f:
                schemas[file_name.removesuffix(SCHEMA_SUFFIX)] = json.load(f)
    return schemas

def _build_validators(schemas):
    # The registry lets schemas $ref each other (mostly common.schema.json) by URL.
    registry = Registry().with_resources(
        (BASE_URL + name + SCHEMA_SUFFIX, Resource.from_contents(schema)) for name, schema in schemas.items())
    validators = {}
    for name, schema in schemas.items():
        if name == 'common':
            continue
        Draft202012Validator.check_schema(schema)
        validators[name] = Draft202012Validator(schema, registry=registry)
    return validators

SCHEMAS = _load_schemas()
_VALIDATORS = _build_validators(SCHEMAS)

# Every schema violation as "path: message", deepest paths first; empty when the record fits.
def record_problems(name, data):
    def sort_key(e):
        return -len(e.absolute_path), [str(p) for p in e.absolute_path]

    return [
        f"{'.'.join(str(p) for p in e.absolute_path) or '(record)'}: {e.message}"
        for e in sorted(_VALIDATORS[name].iter_errors(data), key=sort_key)
    ]

# A $defs entry of a record schema, e.g. definition('common', 'details').
def definition(name, key):
    return SCHEMAS[name]['$defs'][key]
