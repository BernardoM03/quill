from datetime import timedelta

from flask import Blueprint, Flask, g, session

from server import config, ratelimit
from server.db import connection
from server.helpers import load_user
from server.routes import account, admin, auth, campaigns, characters, drafts, invites, maps, packs, rules, setup, users

# Backstop limit for every API request, on top of the stricter per-route limits.
API_RATE_LIMIT = (300, 60)

ACCESS_LEVELS = {'public', 'login', 'member', 'admin'}

ROUTE_MODULES = (setup, auth, users, account, admin, campaigns, characters, drafts, invites, maps, rules, packs)

# A route without an access decorator would be open to everyone, so refuse to start instead.
def check_access_declared(app):
    undeclared = [
        rule.rule for rule in app.url_map.iter_rules()
        if rule.endpoint.startswith('api.')
        and getattr(app.view_functions[rule.endpoint], 'access', None) not in ACCESS_LEVELS
    ]
    if undeclared:
        raise RuntimeError('API routes without @public, @require_login, @require_member or @require_admin: ' + ', '.join(undeclared))

def create_app():
    app = Flask(__name__)
    settings = config.load_config()
    # The signed session cookie holds only the user id.
    app.config['SECRET_KEY'] = config.secret_key(settings)
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=config.session_days(settings))
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = config.secure_cookies(settings)
    # Rejecting other hostnames blocks DNS-rebinding pages from reaching the API.
    # Ports are ignored, since the Vite proxy forwards the browser's localhost:5173 Host header.
    app.config['TRUSTED_HOSTS'] = ['localhost', '127.0.0.1']
    app.config['MAX_CONTENT_LENGTH'] = 1_000_000

    api = Blueprint('api', __name__, url_prefix='/api')

    @api.before_request
    def before_api_request():
        retry_after = ratelimit.hit('api', *API_RATE_LIMIT)
        if retry_after:
            return ratelimit.too_many(retry_after)
        with connection() as conn:
            g.user = load_user(conn)
        if g.user is None and 'user_id' in session:
            # The cookie belongs to a deleted account.
            session.clear()

    for module in ROUTE_MODULES:
        api.register_blueprint(module.bp)
    app.register_blueprint(api)
    check_access_declared(app)
    return app
