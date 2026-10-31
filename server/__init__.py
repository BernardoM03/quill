import os
import secrets
from datetime import timedelta

from flask import Blueprint, Flask

from server import ratelimit
from server.db import DATA_DIR
from server.routes import auth, campaigns, invites, users

# Backstop for every API request, on top of the stricter per-route limits.
API_LIMIT = (300, 60)

SECRET_KEY_PATH = os.path.join(DATA_DIR, 'secret_key')

# Signs session cookies. Made on first run and kept with the database; deleting it signs everyone out.
def load_secret_key():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(SECRET_KEY_PATH):
        fd = os.open(SECRET_KEY_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(secrets.token_hex(32))
    with open(SECRET_KEY_PATH) as f:
        return f.read().strip()

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = load_secret_key()
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
    # HttpOnly is Flask's default. Lax keeps the cookie off cross-site POSTs.
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    # Set QUILL_SECURE_COOKIES=1 when served over HTTPS.
    app.config['SESSION_COOKIE_SECURE'] = os.environ.get('QUILL_SECURE_COOKIES') == '1'
    # Reject requests addressed to any other hostname, so a page using DNS rebinding
    # (a domain re-pointed at 127.0.0.1) can't reach the API. Ports are ignored; the
    # Vite proxy forwards the browser's localhost:5173 Host header unchanged.
    app.config['TRUSTED_HOSTS'] = ['localhost', '127.0.0.1']
    # Larger bodies get 413 before any route runs.
    app.config['MAX_CONTENT_LENGTH'] = 1_000_000

    api = Blueprint('api', __name__, url_prefix='/api')

    @api.before_request
    def limit_api():
        retry_after = ratelimit.hit('api', *API_LIMIT)
        if retry_after:
            return ratelimit.too_many(retry_after)

    for module in (auth, users, campaigns, invites):
        api.register_blueprint(module.bp)
    app.register_blueprint(api)
    return app
