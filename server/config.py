import os
import secrets
import tomllib
from urllib.parse import urlsplit

from server.db import DATA_DIR

ROOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DEFAULT_CONFIG_PATH = os.path.join(ROOT_DIR, 'config.toml')
GENERATED_KEY_PATH = os.path.join(DATA_DIR, 'secret_key')
SECRET_KEY_MIN_LENGTH = 32

class ConfigError(Exception):
    pass

# Reads config.toml (or the file QUILL_CONFIG names); a missing default file means all defaults.
def load_config():
    path = os.environ.get('QUILL_CONFIG', DEFAULT_CONFIG_PATH)
    if not os.path.exists(path):
        if 'QUILL_CONFIG' in os.environ:
            raise ConfigError(f'QUILL_CONFIG points to {path}, which does not exist.')
        return {}
    try:
        with open(path, 'rb') as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f'{path} is not valid TOML: {e}') from e

def _session_settings(config):
    return config.get('session', {})

def _generated_key():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(GENERATED_KEY_PATH):
        # O_EXCL with mode 0o600 creates the key file readable only by this user.
        fd = os.open(GENERATED_KEY_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(secrets.token_hex(32))
    with open(GENERATED_KEY_PATH) as f:
        return f.read().strip()

# Precedence: QUILL_SECRET_KEY, then config.toml, then a key generated into data/secret_key.
# Changing the key signs everyone out.
def secret_key(config):
    candidates = (
        ('QUILL_SECRET_KEY', os.environ.get('QUILL_SECRET_KEY')),
        ('secret_key in config.toml', _session_settings(config).get('secret_key')),
    )
    for source, value in candidates:
        if value is None or value == '':
            continue
        if not isinstance(value, str) or len(value) < SECRET_KEY_MIN_LENGTH:
            raise ConfigError(f'{source} must be at least {SECRET_KEY_MIN_LENGTH} characters. '
                              'Make one with: python -c "import secrets; print(secrets.token_hex(32))"')
        return value
    return _generated_key()

# QUILL_SECURE_COOKIES=1/0 overrides config.toml.
def secure_cookies(config):
    env_value = os.environ.get('QUILL_SECURE_COOKIES')
    if env_value is not None:
        return env_value == '1'
    value = _session_settings(config).get('secure_cookies', False)
    if not isinstance(value, bool):
        raise ConfigError('secure_cookies in config.toml must be true or false.')
    return value

def session_days(config):
    value = _session_settings(config).get('lifetime_days', 30)
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 365:
        raise ConfigError('lifetime_days in config.toml must be a whole number from 1 to 365.')
    return value

# Hostnames the server answers to; anything else gets a 400, which blocks DNS rebinding.
# localhost is always allowed, plus the host in QUILL_PUBLIC_URL and any in QUILL_TRUSTED_HOSTS
# (comma-separated). Ports are ignored, since the Vite proxy forwards localhost:5173.
def trusted_hosts():
    hosts = ['localhost', '127.0.0.1']
    public_url = os.environ.get('QUILL_PUBLIC_URL', '').strip()
    if public_url:
        host = urlsplit(public_url).hostname
        if not host:
            raise ConfigError(f'QUILL_PUBLIC_URL must be a full URL such as https://quill.example.com, not {public_url!r}.')
        hosts.append(host)
    hosts += [h.strip().lower() for h in os.environ.get('QUILL_TRUSTED_HOSTS', '').split(',') if h.strip()]
    return list(dict.fromkeys(hosts))

# A header set by a reverse proxy holding the real client IP, such as CF-Connecting-IP for a
# Cloudflare Tunnel. Without it, every visitor would share the proxy's IP and its rate limits.
# Only set this when the proxy is the sole way in, since anyone reaching the server directly could forge it.
def client_ip_header():
    return os.environ.get('QUILL_CLIENT_IP_HEADER', '').strip() or None

# The built frontend (npm run build) to serve alongside the API, for production.
# Unset in development, where Vite serves the frontend.
def static_dir():
    path = os.environ.get('QUILL_STATIC_DIR', '').strip()
    if not path:
        return None
    if not os.path.isfile(os.path.join(path, 'index.html')):
        raise ConfigError(f'QUILL_STATIC_DIR is {path}, which has no index.html. Run npm run build first.')
    return os.path.abspath(path)
