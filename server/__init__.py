import ipaddress
from datetime import timedelta

from flask import Blueprint, Flask, g, jsonify, send_from_directory, session
from werkzeug.exceptions import NotFound

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

# Replaces REMOTE_ADDR with the client IP a trusted reverse proxy put in `header`.
class ClientIpFromHeader:
    def __init__(self, wsgi_app, header):
        self.wsgi_app = wsgi_app
        self.environ_key = 'HTTP_' + header.upper().replace('-', '_')

    def __call__(self, environ, start_response):
        value = environ.get(self.environ_key, '').strip()
        try:
            environ['REMOTE_ADDR'] = str(ipaddress.ip_address(value))
        except ValueError:
            pass  # Missing or malformed: keep the socket address.
        return self.wsgi_app(environ, start_response)

# Serves the built frontend. Unknown paths get index.html so the client-side router can
# handle them; unknown /api paths stay a JSON 404.
def register_frontend(app, static_dir):
    def index():
        response = send_from_directory(static_dir, 'index.html', max_age=0)
        response.headers['Cache-Control'] = 'no-cache'
        return response

    @app.get('/')
    @app.get('/<path:path>')
    def frontend(path=''):
        if path == 'api' or path.startswith('api/'):
            return jsonify({'error': 'Not found.'}), 404
        if path and not path.endswith('/'):
            try:
                # Vite puts a content hash in every file name under assets/, so they never change.
                immutable = path.startswith('assets/')
                response = send_from_directory(static_dir, path, max_age=31536000 if immutable else 3600)
                if immutable:
                    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
                return response
            except NotFound:
                pass
        return index()

def create_app():
    # static_folder=None: the frontend, if served at all, goes through register_frontend.
    app = Flask(__name__, static_folder=None)
    settings = config.load_config()
    # The signed session cookie holds only the user id.
    app.config['SECRET_KEY'] = config.secret_key(settings)
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=config.session_days(settings))
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = config.secure_cookies(settings)
    # Rejecting other hostnames blocks DNS-rebinding pages from reaching the API.
    app.config['TRUSTED_HOSTS'] = config.trusted_hosts()
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

    static_dir = config.static_dir()
    if static_dir:
        register_frontend(app, static_dir)

    @app.after_request
    def security_headers(response):
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        response.headers.setdefault('X-Frame-Options', 'DENY')
        response.headers.setdefault('Referrer-Policy', 'same-origin')
        return response

    ip_header = config.client_ip_header()
    if ip_header:
        app.wsgi_app = ClientIpFromHeader(app.wsgi_app, ip_header)
    return app
