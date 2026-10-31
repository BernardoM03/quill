import math
import threading
import time
from collections import deque
from functools import wraps

from flask import jsonify, request

# Sliding-window limits kept in memory, keyed by (bucket name, client IP). 
# Every request counts, successful or not. 
# State resets when the server restarts and isn't shared between processes

_hits = {}
_lock = threading.Lock()
_calls_since_sweep = 0
SWEEP_EVERY = 1000

def _client_ip():
    return request.remote_addr or 'unknown'

def _sweep(now):
    # Drop keys whose newest hit has left every window, so memory stays bounded.
    for key in [k for k, (window, q) in _hits.items() if not q or q[-1] <= now - window]:
        del _hits[key]

# Records a hit and returns 0 if it's allowed, else the seconds until the oldest hit expires.
# subject defaults to the client IP; pass e.g. a username to limit across all IPs.
def hit(bucket, max_requests, window_seconds, subject=None):
    global _calls_since_sweep
    now = time.monotonic()
    key = (bucket, subject if subject is not None else _client_ip())
    with _lock:
        _calls_since_sweep += 1
        if _calls_since_sweep >= SWEEP_EVERY:
            _calls_since_sweep = 0
            _sweep(now)
        _, q = _hits.setdefault(key, (window_seconds, deque()))
        while q and q[0] <= now - window_seconds:
            q.popleft()
        if len(q) >= max_requests:
            return max(1, math.ceil(q[0] + window_seconds - now))
        q.append(now)
        return 0

def too_many(retry_after):
    response = jsonify({'error': 'Too many requests. Try again later.'})
    response.status_code = 429
    response.headers['Retry-After'] = str(retry_after)
    return response

# Route decorator: at most max_requests per window_seconds per client IP.
def limit(bucket, max_requests, window_seconds):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            retry_after = hit(bucket, max_requests, window_seconds)
            if retry_after:
                return too_many(retry_after)
            return view(*args, **kwargs)
        return wrapped
    return decorator

def reset():
    with _lock:
        _hits.clear()
