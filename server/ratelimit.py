import math
import threading
import time
from collections import deque
from functools import wraps

from flask import jsonify, request

# In-memory sliding-window limits keyed by (bucket, subject), where subject defaults to the client IP.
# Every request counts, successful or not.
# State resets on restart and isn't shared between processes.

SWEEP_EVERY = 1000

# key -> (window_seconds, deque of hit timestamps)
_hits = {}
_lock = threading.Lock()
_calls_since_sweep = 0

def _client_ip():
    return request.remote_addr or 'unknown'

# Drops keys whose newest hit has left its window, so memory stays bounded.
def _sweep(now):
    expired = [key for key, (window, times) in _hits.items() if not times or times[-1] <= now - window]
    for key in expired:
        del _hits[key]

# Records a hit and returns 0 if allowed, else the seconds until the oldest hit expires.
def hit(bucket, max_requests, window_seconds, subject=None):
    global _calls_since_sweep
    now = time.monotonic()
    key = (bucket, subject if subject is not None else _client_ip())
    with _lock:
        _calls_since_sweep += 1
        if _calls_since_sweep >= SWEEP_EVERY:
            _calls_since_sweep = 0
            _sweep(now)
        _, times = _hits.setdefault(key, (window_seconds, deque()))
        while times and times[0] <= now - window_seconds:
            times.popleft()
        if len(times) >= max_requests:
            return max(1, math.ceil(times[0] + window_seconds - now))
        times.append(now)
        return 0

def too_many(retry_after):
    response = jsonify({'error': 'Too many requests. Try again later.'})
    response.status_code = 429
    response.headers['Retry-After'] = str(retry_after)
    return response

# Route decorator allowing at most max_requests per window_seconds per client IP.
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
