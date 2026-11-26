# Deploying Quill

Quill ships as one Docker image: gunicorn runs the Flask API and serves the built
frontend from the same origin. Every piece of state (accounts, campaigns, sheets, images,
the session key) lives in SQLite in the `quill-data` volume.

## Run it locally

```sh
docker compose up -d --build
docker compose logs quill        # prints the one-time admin setup link
```

Open http://127.0.0.1:8000. The port is bound to loopback only, so other machines can't
reach it.

## Publish at quill.al08.dev via Cloudflare Tunnel

The tunnel makes an outbound connection to Cloudflare, so you don't need to open a router
port or have a public IP, and Cloudflare handles TLS.

```
player ──HTTPS──> Cloudflare edge ──tunnel──> cloudflared container ──HTTP──> quill:8000
```

### One-time Cloudflare setup

1. Make sure `al08.dev` is an active zone in your Cloudflare account.
2. Open **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and
   name the tunnel `quill`.
3. On the **Install connector** step, copy the token, which is the long string after
   `--token` in any of the install commands. Skip installing the connector itself, because
   Docker runs it.
4. Under **Public hostnames**, add:
   - Subdomain `quill`, domain `al08.dev`
   - Service type **HTTP**, URL `quill:8000`

   Cloudflare creates the `quill.al08.dev` DNS record for you.

### Start it

```sh
cp .env.example .env              # then paste the token into CLOUDFLARE_TUNNEL_TOKEN
docker compose --profile tunnel up -d --build
docker compose logs quill         # setup link, already pointing at https://quill.al08.dev
```

Open the setup link to create the admin account. The link works once, and a new one is
printed on each start until an admin exists. To check the tunnel, run
`docker compose ps`: `cloudflared` should show as `healthy`.

## Settings

All settings are read from `.env`. See `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `QUILL_PUBLIC_URL` | Public URL. Its host is the only one, besides localhost, that the server answers to. |
| `QUILL_SECURE_COOKIES` | `1` behind HTTPS. |
| `QUILL_CLIENT_IP_HEADER` | `CF-Connecting-IP` behind the tunnel, so rate limits apply per player rather than to everyone sharing the tunnel's IP. |
| `QUILL_TRUSTED_HOSTS` | Extra hostnames to accept, comma-separated. |
| `QUILL_SECRET_KEY` | Optional. If blank, a key is generated into the volume. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel connector token. Keep it secret. |

**Don't publish port 8000 beyond `127.0.0.1`.** Quill trusts `CF-Connecting-IP`, so
anyone who can reach the container directly could forge their IP and get around the rate
limits.

**Run one gunicorn worker.** Rate limits, the setup link and the cleanup job are held in
process memory. Add threads rather than workers if you need more capacity.

## Updating

```sh
git pull
docker compose --profile tunnel up -d --build
```

Database migrations run automatically on start.

## Backups

Run this to take a consistent snapshot while Quill is running (SQLite's online backup):

```sh
docker compose exec quill python -c "import sqlite3; s=sqlite3.connect('data/quill.db'); d=sqlite3.connect('data/backup.db'); s.backup(d); d.close()"
docker compose cp quill:/app/data/backup.db ./quill-backup-$(date +%F).db
```

`data/secret_key` is also in the volume. Losing it only signs everyone out.

To restore, stop the stack, copy the backup into the volume as `quill.db`, delete any
`quill.db-wal` and `quill.db-shm` files next to it, then start the stack again.
