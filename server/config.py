import os
import secrets
import tomllib

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
