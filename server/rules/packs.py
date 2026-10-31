import json
import os
import threading

# Installed content packs: every folder under packs/ with a pack.json. They're kept out of
# public/ so only the API serves them (server/routes/packs.py), to signed-in users.
# QUILL_PACKS_DIR points elsewhere, e.g. a mounted volume in Docker.
DEFAULT_PACKS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packs')

class PackError(Exception):
    pass

def packs_dir():
    return os.environ.get('QUILL_PACKS_DIR', DEFAULT_PACKS_DIR)

def _read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def _load_manifests():
    root = packs_dir()
    manifests = []
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name, 'pack.json')
        if os.path.isfile(path):
            manifests.append(_read_json(path))
    return manifests

# Manifests and collections are read once per process and kept; packs only change when the
# server is redeployed. reload() drops the cache (tests, or after installing a pack).
_cache = {}
# Re-entrant: loading a collection reads the manifests while already holding it.
_lock = threading.RLock()

# Every installed pack's pack.json, in folder order.
def load_manifests():
    with _lock:
        if '_manifests' not in _cache:
            _cache['_manifests'] = _load_manifests()
        return _cache['_manifests']

# The collection names some installed pack provides ("spells", "classes", ...).
def collection_names():
    return {name for manifest in load_manifests() for name in manifest.get('provides', [])}

def _load_collection(name):
    entries = {}
    for manifest in load_manifests():
        if name not in manifest.get('provides', []):
            continue
        for entry in _read_json(os.path.join(packs_dir(), manifest['id'], f'{name}.json')):
            # Ids are namespaced by pack ("srd-5.2:spell/..."), so a clash means a pack
            # reused another pack's namespace: fail loudly rather than shadow.
            if entry['id'] in entries:
                raise PackError(f'Duplicate {name} id "{entry["id"]}" in pack {manifest["id"]}')
            entries[entry['id']] = entry
    return entries

# Every entry in a collection across installed packs, keyed by id, in pack order.
def collection(name):
    with _lock:
        if name not in _cache:
            _cache[name] = _load_collection(name)
        return _cache[name]

def reload():
    with _lock:
        _cache.clear()
