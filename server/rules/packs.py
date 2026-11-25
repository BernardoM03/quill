import json
import os
import threading

# Installed content packs are the folders under packs/ with a pack.json, served only through the API.
# QUILL_PACKS_DIR can point elsewhere, such as a mounted Docker volume.
DEFAULT_PACKS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packs')
MANIFESTS_KEY = '_manifests'

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
    for folder in sorted(os.listdir(root)):
        manifest_path = os.path.join(root, folder, 'pack.json')
        if os.path.isfile(manifest_path):
            manifests.append(_read_json(manifest_path))
    return manifests

# Packs only change on redeploy, so they're cached per process until reload().
_cache = {}
# Re-entrant because loading a collection reads the manifests while holding the lock.
_lock = threading.RLock()

def _cached(key, load):
    with _lock:
        if key not in _cache:
            _cache[key] = load()
        return _cache[key]

# Every installed pack's pack.json, in folder order.
def load_manifests():
    return _cached(MANIFESTS_KEY, _load_manifests)

# The collection names some installed pack provides ("spells", "classes", ...).
def collection_names():
    return {name for manifest in load_manifests() for name in manifest.get('provides', [])}

def _load_collection(name):
    entries = {}
    for manifest in load_manifests():
        if name not in manifest.get('provides', []):
            continue
        for entry in _read_json(os.path.join(packs_dir(), manifest['id'], f'{name}.json')):
            # Ids are namespaced by pack, so a clash means a pack reused another's namespace.
            if entry['id'] in entries:
                raise PackError(f'Duplicate {name} id "{entry["id"]}" in pack {manifest["id"]}')
            entries[entry['id']] = entry
    return entries

# Every entry in a collection across installed packs, keyed by id, in pack order.
def collection(name):
    return _cached(name, lambda: _load_collection(name))

def reload():
    with _lock:
        _cache.clear()
