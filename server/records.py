# Checks stored records (a draft, a sheet, campaign settings) against their JSON Schemas in
# schemas/records/, the source of truth for each record's shape. Loaded once per process.
#
#   problems = record_problems('draft', data)   # [] when it fits

import json
import os

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

RECORDS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'schemas', 'records')
BASE_URL = 'https://quill.local/schemas/records/'

def _load():
    schemas = {}
    for file in sorted(os.listdir(RECORDS_DIR)):
        if file.endswith('.schema.json'):
            with open(os.path.join(RECORDS_DIR, file), encoding='utf-8') as f:
                schemas[file[:-len('.schema.json')]] = json.load(f)
    registry = Registry().with_resources(
        (BASE_URL + f'{name}.schema.json', Resource.from_contents(schema)) for name, schema in schemas.items())
    validators = {}
    for name, schema in schemas.items():
        if name == 'common':
            continue
        Draft202012Validator.check_schema(schema)
        validators[name] = Draft202012Validator(schema, registry=registry)
    return schemas, validators

SCHEMAS, _VALIDATORS = _load()

# Every way data doesn't fit the record's schema, as messages like "classChoices.subclass: ..."
# (the path, then what's wrong), most specific first. Empty when it fits.
def record_problems(name, data):
    problems = []
    for e in sorted(_VALIDATORS[name].iter_errors(data), key=lambda e: (-len(e.absolute_path), list(map(str, e.absolute_path)))):
        path = '.'.join(str(p) for p in e.absolute_path) or '(record)'
        problems.append(f'{path}: {e.message}')
    return problems

# A $defs entry of a record schema, e.g. definition('common', 'details').
def definition(name, key):
    return SCHEMAS[name]['$defs'][key]
