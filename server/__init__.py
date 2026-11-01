from datetime import timedelta

from flask import Blueprint, Flask, g, session

from server import config, ratelimit
from server.db import connect
from server.helpers import load_user
from server.routes import account, admin, auth, campaigns, characters, drafts, invites, packs, rules, setup, users

# Backstop for every API request, on top of the stricter per-route limits.
API_LIMIT = (300, 60)

ACCESS_LEVELS = {'public', 'login', 'member', 'admin'}

# Every API route must declare who may call it (server/access.py). One that doesn't
# would be open to everyone, so the server won't start until it's fixed.
def check_access_declared(app):
    missing = [
        rule.rule for rule in app.url_map.iter_rules()
        if rule.endpoint.startswith('api.')
        and getattr(app.view_functions[rule.endpoint], 'access', None) not in ACCESS_LEVELS
    ]
    if missing:
        raise RuntimeError('API routes without @public, @require_login, @require_member or @require_admin: ' + ', '.join(missing))

def create_app():
    app = Flask(__name__)
    settings = config.load_config()
    # Signed session cookie: holds only the user id. HttpOnly keeps it from page scripts;
    # Lax keeps it off cross-site POSTs; Secure (HTTPS only) is set from config.
    app.config['SECRET_KEY'] = config.secret_key(settings)
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=config.session_days(settings))
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = config.secure_cookies(settings)
    # Reject requests addressed to any other hostname, so a page using DNS rebinding
    # (a domain re-pointed at 127.0.0.1) can't reach the API. Ports are ignored; the
    # Vite proxy forwards the browser's localhost:5173 Host header unchanged.
    app.config['TRUSTED_HOSTS'] = ['localhost', '127.0.0.1']
    # Larger bodies get 413 before any route runs.
    app.config['MAX_CONTENT_LENGTH'] = 1_000_000

    api = Blueprint('api', __name__, url_prefix='/api')

    @api.before_request
    def before_api_request():
        retry_after = ratelimit.hit('api', *API_LIMIT)
        if retry_after:
            return ratelimit.too_many(retry_after)
        conn = connect()
        try:
            g.user = load_user(conn)
        finally:
            conn.close()
        if g.user is None and 'user_id' in session:
            # A cookie left over from a deleted account.
            session.clear()

    for module in (setup, auth, users, account, admin, campaigns, characters, drafts, invites, rules, packs):
        api.register_blueprint(module.bp)
    app.register_blueprint(api)
    check_access_declared(app)
    return app
