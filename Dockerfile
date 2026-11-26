# syntax=docker/dockerfile:1

# --- Frontend build ---------------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig*.json ./
COPY src ./src
RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    QUILL_STATIC_DIR=/app/dist

WORKDIR /app

COPY requirements.txt requirements-prod.txt ./
RUN pip install -r requirements-prod.txt

# Unprivileged user. data/ is created here so a fresh named volume inherits its ownership.
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin quill \
    && mkdir -p /app/data && chown quill:quill /app/data

COPY server ./server
COPY packs ./packs
COPY schemas ./schemas
COPY LICENSE NOTICE ./
COPY --from=web /build/dist ./dist

USER quill
VOLUME ["/app/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/setup', timeout=4)" || exit 1

# One worker only (see server/wsgi.py); threads handle concurrency.
CMD ["gunicorn", "server.wsgi:app", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "1", "--threads", "8", \
     "--timeout", "60", "--graceful-timeout", "20", \
     "--access-logfile", "-", "--no-control-socket"]
