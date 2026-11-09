# Quill System Guide

How Quill is built, why it is built that way, and how it looks. Each chapter stands alone;
file references are `path:line` from the repo root. Anything marked **Planned** does not
exist in the code yet.

| # | Chapter | Status |
|---|---|---|
| 1 | [Architecture & Tech Stack](#chapter-1--architecture--tech-stack) | Written |
| 2 | [Accounts & Permissions](#chapter-2--accounts--permissions) | Written |
| 3 | Campaigns | Not yet written |
| 4 | Characters | Not yet written |
| 5 | Packs & Rules Engine | Not yet written |
| 6 | Design System | Not yet written |
| A | Glossary | Not yet written |

---

## Chapter 1 — Architecture & Tech Stack

Quill is a React single-page app that talks to a Flask JSON API over `/api`. The API owns
every rules decision: it reads game content from JSON packs on disk, checks what players
submit against the active campaign's rules, and stores the result in one SQLite file. JSON
Schema files define the shape of both the packs and the JSON records the database stores.

### 1.1 Stack

| Layer | Technology | Lives in | Job |
|---|---|---|---|
| Content | JSON files, one folder per pack | `packs/<pack-id>/` | Game content: classes, spells, species, ... |
| Shape | JSON Schema, draft 2020-12 | `schemas/`, `schemas/records/` | Defines what a pack file or stored record may contain |
| API | Python 3, Flask | `server/` | HTTP routes, sessions, access checks |
| Rules engine | Python, no framework | `server/rules/` | Decides what a character may be built from and whether a build is valid |
| Storage | SQLite (`sqlite3` from the Python standard library) | `data/quill.db` | Users, campaigns, characters, drafts |
| Images | Pillow | `server/portraits.py` | Re-encodes portrait uploads |
| UI | React 19, React Router 7, TypeScript | `src/` | Pages, the creation wizard, the sheet |
| HTTP client | axios | `src/api/` | One function per API call |
| Build / dev server | Vite 8 | `vite.config.ts` | Serves the UI in development, bundles it for release |
| Tooling | Node 24, ajv, json-schema-to-typescript | `scripts/` | Pack validation, reference checks, type generation |

Python dependencies are in `requirements.txt` (`flask`, `pillow`, `jsonschema`); JavaScript
dependencies are in `package.json`.

*JSON Schema* is a JSON document that describes the allowed shape of other JSON (required
fields, types, enums). Quill uses it as the single definition of each data shape: the
server validates against it and the TypeScript types are generated from it.

### 1.2 Repo map

```
quill/
├── packs/                 Content packs. Server-only: never served as static files.
│   └── srd-5.2/           SRD 5.2.1. pack.json is the manifest; one file per collection.
├── schemas/               JSON Schemas for pack files (class, spell, species, ...).
│   └── records/           JSON Schemas for records stored in SQLite (draft, sheet, campaign-settings).
├── server/                Flask API.
│   ├── __init__.py        App factory: config, cookies, global rate limit, blueprint registration.
│   ├── __main__.py        Entry point: `python -m server`.
│   ├── access.py          Access-level decorators every route must carry.
│   ├── config.py          Reads config.toml and QUILL_* environment variables.
│   ├── db.py              Connection helper and the migration list.
│   ├── records.py         Validates stored records against schemas/records/.
│   ├── helpers.py         JSON errors, ETag responses, name cleaning, session sign-in.
│   ├── ratelimit.py       In-memory sliding-window rate limits.
│   ├── portraits.py       Portrait decoding and re-encoding.
│   ├── campaign_content.py  Reads and writes a campaign's allowed-content tables.
│   ├── routes/            One blueprint per resource (auth, campaigns, characters, drafts, ...).
│   └── rules/             Rules engine (Chapter 5).
├── src/                   React app.
│   ├── main.tsx           Router: every page and its URL.
│   ├── routes/            One component per page.
│   ├── components/        Shared and feature components (wizard steps, sheet, settings, portrait).
│   ├── api/               axios client and one module per API resource.
│   ├── datatypes/         Hand-written response types; generated/ holds record types.
│   └── packs/             Pack loader, React hooks, and generated/ pack types.
├── scripts/               Node tooling: validate-packs, check-refs, gen-pack-types, dev-api.
├── data/                  Created at first run; git-ignored. quill.db and secret_key.
├── documents/             Project documents, including this guide.
├── config.example.toml    Template for config.toml (git-ignored).
└── .github/workflows/     CI: validate.yml.
```

### 1.3 Three kinds of data

Quill keeps three kinds of data, and each has a different source of truth and a different
check.

| Kind | Example | Stored in | Shape defined by | Checked by | Checked when |
|---|---|---|---|---|---|
| **Pack content** | `srd-5.2:spell/fireball` | `packs/<id>/<collection>.json` | `schemas/<kind>.schema.json` | `npm run validate` (ajv), `npm run check-refs` | Before commit, and in CI (`validate` only) |
| **Records** | A draft, a sheet | JSON text columns in SQLite | `schemas/records/*.schema.json` | `server/records.py:35` `record_problems` | Every write of a draft or sheet |
| **Rows** | A user, a membership, an invite | SQLite tables | `MIGRATIONS` in `server/db.py:9` | SQLite constraints (`CHECK`, `FOREIGN KEY`, `UNIQUE`) | Every write |

Records are JSON stored inside a row: `character_drafts.draft`, `characters.sheet` and
`campaigns.settings`. Each has a `CHECK (json_valid(...))` constraint in SQL, and the draft
and sheet are also validated against their schema before they are written
(`server/routes/drafts.py:53`, `server/routes/characters.py:114`). Campaign rules are
checked by a smaller checker that reads the same schema file (`server/rules/settings.py:15`;
Chapter 3).

The server does not validate pack files when it loads them. It trusts that `npm run
validate` passed, and only refuses duplicate ids across packs (`server/rules/packs.py:54`).

Schemas:
[`pack.schema.json`](../schemas/pack.schema.json) ·
[`common.schema.json`](../schemas/common.schema.json) ·
[`records/draft.schema.json`](../schemas/records/draft.schema.json) ·
[`records/sheet.schema.json`](../schemas/records/sheet.schema.json) ·
[`records/campaign-settings.schema.json`](../schemas/records/campaign-settings.schema.json) ·
[`records/common.schema.json`](../schemas/records/common.schema.json)

### 1.4 Request flow

```
 Browser  ─ React page (src/routes/*) ─► src/api/*.ts ─► apiClient, baseURL "/api"
    │                                                    src/api/client.ts:4
    │  same-origin request, session cookie attached
    ▼
 Vite dev server :5173 ─ proxy "/api" ─► http://localhost:5174        (development only)
    │                                    vite.config.ts:58
    ▼
 Flask app (server/__init__.py create_app)
    │  1. Host header must be localhost or 127.0.0.1          :39
    │  2. Body over 1 MB → 413                                :41
    │  3. Global rate limit, 300 requests / 60 s per IP       :11, :45
    │  4. Load the signed-in user into g.user                 :52
    ▼
 Route in server/routes/*.py
    │  5. Access decorator: @public / @require_login / @require_member / @require_admin
    │  6. Per-route rate limit where the route has one (@limit)
    │
    ├─► Rules engine  server/rules/*.py ──► pack cache  server/rules/packs.py ──► packs/*/*.json
    ├─► Record check  server/records.py ──► schemas/records/*.schema.json
    ▼
 SQLite  data/quill.db  (server/db.py:217 connect)
    │
    ▼
 JSON response  { ... } or { "error": "message" }
    │  401 on any page except /login, /setup, /join/ → redirect to /login?next=...
    ▼  src/api/client.ts:10
 Browser
```

*Flask* is a Python web framework: a function decorated with `@bp.get('/path')` handles
that URL. A *blueprint* is a group of such routes registered together. A *decorator* is a
line starting with `@` that wraps a function to add behaviour before or after it runs.

#### Traced: saving a draft

`PUT /api/drafts/<id>` runs each time the wizard saves progress.

| Step | What happens | Where |
|---|---|---|
| 1 | The wizard calls `saveDraft(id, saved)` | `src/api/drafts.ts:37` |
| 2 | Vite forwards `/api/drafts/<id>` to Flask | `vite.config.ts:58` |
| 3 | `before_api_request` counts the hit and loads `g.user` | `server/__init__.py:45` |
| 4 | `@require_login` answers 401 if there is no user | `server/access.py:21` |
| 5 | `put_draft` looks up the draft, scoped to its owner | `server/routes/drafts.py:172` |
| 6 | `clean_draft` fills missing fields, drops empty choices, validates against `draft.schema.json`, enforces 32 KB | `server/routes/drafts.py:34` |
| 7 | `creation_setting` confirms the player may make characters in that campaign | `server/routes/characters.py:31` |
| 8 | The update runs in a transaction (`with conn:`); moving the draft to another campaign clears its rolls | `server/routes/drafts.py:186` |

A draft save checks shape only. Rules checks run on `POST /api/characters/validate`
(`server/routes/characters.py:198`) and again on create (`server/routes/characters.py:220`),
which calls `check_draft` (`server/rules/characters.py:247`) and refuses the write if it
returns errors. The browser never decides what is allowed
(`server/rules/characters.py:1`).

### 1.5 Backend

#### Startup

`python -m server` runs `server/__main__.py`:

1. `create_app()` reads configuration, sets cookie flags, registers every blueprint under
   `/api`, then calls `check_access_declared`. A configuration error exits with a message.
2. `init_db()` creates `data/quill.db` if needed and applies pending migrations (1.7).
3. `account.start_daily_purge()` starts a background thread that deletes account snapshots
   older than 30 days, now and every 24 hours (`server/routes/account.py:62`).
4. `setup.bootstrap()` creates the admin from `QUILL_ADMIN_USERNAME` /
   `QUILL_ADMIN_PASSWORD`, or prints a one-time setup link if no admin has a password
   (`server/routes/setup.py:66`).
5. `app.run(port=5174, debug=False)` starts Flask's built-in server.

#### Every route declares its access level

Each route carries exactly one decorator from `server/access.py`:

| Decorator | Lets through | Others get |
|---|---|---|
| `@public` | Everyone | — |
| `@require_login` | Any signed-in user | 401 |
| `@require_member` | Members of the route's `<campaign_id>`, and the admin | 401 signed out, 404 otherwise |
| `@require_admin` | The admin | 401 signed out, 404 otherwise |

`check_access_declared` (`server/__init__.py:17`) refuses to start the server if any
`/api` route lacks one, so a forgotten decorator stops startup instead of opening the
route. The 404 answers keep a non-member from learning that a campaign or admin route
exists. Chapter 2 covers the permission rules in full.

#### Route modules

| Blueprint | Covers |
|---|---|
| `setup` | First-run admin creation |
| `auth` | Sign-up, sign-in, sign-out, `/me` |
| `users` | `/user`: the home page's campaigns and characters |
| `account` | Account export and deletion |
| `admin` | Deleted-account snapshots and restore |
| `campaigns` | Campaign CRUD, members, rules and allowed content |
| `invites` | Invite links: create, check, accept, revoke |
| `characters` | Wizard options, validation, create, sheet edits, rolls, portraits |
| `drafts` | Draft CRUD and ability rolls |
| `rules` | `/rules`: default rules and limits |
| `packs` | Pack manifests and collections |

Registration order is in `server/__init__.py:59`.

#### Configuration

`config.toml` is optional (copy `config.example.toml`); environment variables override it.

| Setting | Env variable | config.toml | Default |
|---|---|---|---|
| Config file path | `QUILL_CONFIG` | — | `config.toml` at repo root |
| Session signing key | `QUILL_SECRET_KEY` | `[session] secret_key` | Generated into `data/secret_key` |
| HTTPS-only cookie | `QUILL_SECURE_COOKIES=1` | `[session] secure_cookies` | `false` |
| Sign-in lifetime | — | `[session] lifetime_days` (1–365) | 30 |
| Packs folder | `QUILL_PACKS_DIR` | — | `packs/` |
| First admin | `QUILL_ADMIN_USERNAME`, `QUILL_ADMIN_PASSWORD` | — | Setup link printed instead |
| Setup link base URL | `QUILL_PUBLIC_URL` | — | `http://localhost:5173` |

Invalid values raise `ConfigError` at startup (`server/config.py:12`).

#### Rules engine modules

The engine is plain Python under `server/rules/`. Routes call it; it never touches the
request. Chapter 5 covers how it reads pack data.

| Module | Decides |
|---|---|
| `packs.py` | Loads and caches installed packs; merges each collection across packs |
| `settings.py` | Campaign rules: defaults, limits, value checks, all read from `campaign-settings.schema.json` |
| `campaign.py` | Whether a campaign `PATCH` body is valid |
| `problems.py` | What a campaign's allowed content is missing before characters can be made |
| `characters.py` | The setting a character is built in; `check_draft`, the full validation of a build |
| `choices.py` | Turns a pack choice into pickable options, applying qualifiers and allowed content |
| `classes.py` | A class at a given level: features, proficiencies, choices, subclass |
| `backgrounds.py` | What a background grants and asks for, under the origin rules |
| `abilities.py` | Ability score methods and hit points |
| `scores.py` | Ability score layers: base, increases, score, current |
| `details.py` | Description fields and alignment, read from `records/common.schema.json`; custom question answers |
| `spells.py` | Spell-list rules (classes left without cantrips) |

### 1.6 Packs at runtime

| Concern | Behaviour | Where |
|---|---|---|
| Discovery | Every folder under `packs/` with a `pack.json`, in folder-name order | `server/rules/packs.py:20` |
| Loading | Each collection is read on first use and cached for the life of the process | `server/rules/packs.py:60` |
| Merging | A collection is the union of that file across all packs that list it in `provides` | `server/rules/packs.py:46` |
| Id clash | Two entries with one id raise `PackError` | `server/rules/packs.py:54` |
| Manifests endpoint | `GET /api/packs`: public, so the Legal page can show licenses; `Cache-Control: public, max-age=300` | `server/routes/packs.py:15` |
| Collection endpoint | `GET /api/packs/collections/<name>`: signed-in only; `private, max-age=300` | `server/routes/packs.py:23` |
| Browser cache | One fetch per collection per page load; a failed fetch is retried on next use | `src/packs/loader.ts:24` |
| React access | `useCollection(name)`, `useEntry(name, id)`, `usePackManifests()` | `src/packs/usePacks.ts` |

`packs/` and `schemas/` are never served as static files. A Vite plugin answers 404 for
any dev-server request inside them, including encoded and `/@fs/` paths
(`vite.config.ts:13`), and Vite's `fs.deny` list blocks them a second time
(`vite.config.ts:60`). A production build does not contain them.

Changing a pack file requires a server restart: the cache has a `reload()`
(`server/rules/packs.py:66`) but no route or signal calls it.

### 1.7 Database

*SQLite* is a database stored in a single file and accessed through a library, with no
separate database server. Quill's file is `data/quill.db`, created on first run.

| Setting | Value | Where |
|---|---|---|
| Foreign keys | On for every connection (`PRAGMA foreign_keys = ON`) | `server/db.py:220` |
| Journal mode | WAL, which lets reads continue during a write | `server/db.py:228` |
| Row access | `sqlite3.Row`: columns by name | `server/db.py:219` |
| Ids | UUID strings | `TEXT PRIMARY KEY` on each table |
| Timestamps | ISO-8601 UTC text, from the `NOW` SQL expression | `server/helpers.py:8` |
| Connections | Opened and closed inside each route; writes use `with conn:` as the transaction | every route module |

#### Tables

| Table | Holds | Added in migration |
|---|---|---|
| `meta` | `schema_version` | 1 |
| `users` | Accounts; `deleted_at` for soft delete | 2 |
| `campaigns` | Name, description, `settings` JSON (rules and custom questions; content limits moved out in migration 9) | 2 |
| `memberships` | `(campaign_id, user_id, role)`, role `gm` or `player` | 2 |
| `characters` | `sheet` JSON; `campaign_id` NULL for the Character Sandbox; one active character per player per campaign | 2, rebuilt in 4 and 5 |
| `invites` | Invite links, stored as a SHA-256 hash of the token | 2 |
| `deleted_accounts` | 30-day snapshots for admin restore | 3 |
| `character_portraits` | 256×256 WebP blob per character | 6 |
| `character_drafts` | `draft` JSON, wizard `step`, server-made `rolls` | 7, 8 |
| `campaign_content_limits` | Which collections a campaign limits | 9 |
| `campaign_content` | The allowed entry ids in a limited collection | 9 |

Characters and drafts in a campaign reference the owner's membership row with
`ON DELETE CASCADE`, so removing a player from a campaign removes their characters and
drafts there (migrations 4 and 7). Chapters 2–4 cover each table's rules.

### 1.8 Migrations

A *migration* is a script that moves the database from one schema version to the next.
Quill's are SQL strings in the `MIGRATIONS` list (`server/db.py:9`). Entry *n* (counting
from 1) upgrades the database to version *n*; `SCHEMA_VERSION` is the list's length.

`init_db()` (`server/db.py:224`) runs at every startup:

1. Create `meta` and set `schema_version` to 1 if the table is new.
2. For each version above the stored one, run that migration and the version update in
   one transaction (`BEGIN; ... ; COMMIT;`). A failed migration leaves the database at the
   previous version.

Rules:

- Append new migrations. Never edit one that has shipped: databases that already ran it
  will not run it again.
- To change a column's constraints or foreign keys, rebuild the table: create
  `<table>_new`, copy rows, drop the old table, rename, recreate indexes. SQLite cannot
  alter constraints in place. Migrations 4 and 5 are the reference.
- Upgrade stored JSON in SQL with `json_set`, `json_remove` and `json_each`. Migrations 9
  and 10 are the reference.

#### Changing a record's shape

Drafts and sheets carry a `version` field, fixed by a `const` in their schema and written
by the server (`DRAFT_VERSION` at `server/routes/drafts.py:23`, `SHEET_VERSION` at
`server/routes/characters.py:82`). A shape change that old records would fail touches
five places:

1. Edit the schema in `schemas/records/` and raise the `version` const.
2. Raise the matching constant in the server.
3. Append a migration that rewrites stored JSON to the new shape and sets the new version.
4. Run `npm run gen-types`.
5. Fix the TypeScript errors `npm run build` now reports.

Migration 10 is the reference: it removed empty choices from stored drafts and set
`version` to 1.

### 1.9 Frontend

| Concern | Choice | Where |
|---|---|---|
| Rendering | React 19 function components and hooks | `src/` |
| Routing | `createBrowserRouter` with a flat route list | `src/main.tsx:20` |
| API calls | One axios instance, `baseURL: "/api"` | `src/api/client.ts:4` |
| Signed-out handling | Response interceptor: a 401 outside `/login`, `/setup`, `/join/` redirects to `/login?next=<path>` | `src/api/client.ts:10` |
| Markdown | `react-markdown` | `src/components/RulesText.tsx` |
| Styles | Plain CSS files beside their components; global styles in `src/index.css` and `src/App.css` | Chapter 6 |
| Lint | ESLint with React Hooks and React Refresh plugins | `eslint.config.js` |
| TypeScript | `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`; no emit (Vite compiles) | `tsconfig.app.json` |

An *interceptor* is a function axios runs on every response before the calling code sees
it.

#### Pages

| URL | Component | Purpose |
|---|---|---|
| `/` | `App` | Home: campaigns, characters, drafts |
| `/rules` | `Rules` (child of `/`) | Rules reference |
| `/legal` | `Legal` | Pack licenses and attributions |
| `/setup` | `Setup` | First-run admin creation |
| `/login` | `Login` | Sign-in and sign-up |
| `/account` | `AccountSettings` | Account settings, export, deletion |
| `/admin` | `Admin` | Deleted-account restore |
| `/characters/new` | `NewCharacter` | Wizard, Character Sandbox or resumed draft (`?draft=<id>`) |
| `/campaigns/:campaignID/characters/new` | `NewCharacter` | Wizard in a campaign |
| `/characters/:characterID` | `CharacterPage` | The sheet |
| `/characters/:characterID/edit` | `NewCharacter` | Wizard editing an existing character |
| `/setup/campaign` | `CampaignSettings` | New campaign |
| `/campaignsettings/:campaignID` | `CampaignSettings` | Campaign settings |
| `/campaign/:campaignID` | `CampaignView` | Campaign page |
| `/join/:token` | `Join` | Accept an invite link |

#### Where types come from

| Type | Source |
|---|---|
| Pack entries (`Entry<'spells'>`, ...) | Generated from `schemas/*.schema.json`; mapped by collection in `src/packs/types.ts:23` |
| Draft, sheet, campaign rules | Generated from `schemas/records/`; re-exported or wrapped in `src/api/characters.ts:1` and `src/datatypes/campaignRules.ts:1` |
| API responses (`user`, `campaign`, `draftSummary`, ...) | Hand-written in `src/datatypes/` and `src/api/`; no schema describes them |

### 1.10 Type generation

`npm run gen-types` runs `scripts/gen-pack-types.mjs`, which turns each schema into a
TypeScript file with `json-schema-to-typescript`.

| Input | Output | Type name |
|---|---|---|
| `schemas/<stem>.schema.json` | `src/packs/generated/<stem>.ts` | `<Stem>Schema`, e.g. `MagicItemSchema` |
| `schemas/records/<stem>.schema.json` | `src/datatypes/generated/<stem>.ts` | `<Stem>Schema`, e.g. `DraftSchema` |

Behaviour worth knowing before editing a schema:

- Both output folders are deleted and rewritten on every run. Edits made by hand to a
  generated file are lost; each file's banner says so.
- `common.schema.json` in each folder produces no file. Its definitions appear inside the
  types that `$ref` them.
- `description` strings are stripped, so generated types carry no doc comments. Read the
  schema for field meanings.
- `additionalProperties: false` is applied, so a generated object type has no index
  signature.
- Arrays with `maxItems` of 6 or fewer become tuples (`sharedScores` is exactly six);
  longer ones stay arrays (`scripts/gen-pack-types.mjs:59`).
- `$ref` URLs under `https://quill.local/schemas/` resolve to local files
  (`scripts/gen-pack-types.mjs:31`); nothing is fetched.

Run it after any schema change and commit the generated files with the schema. CI's
`npm run build` type-checks against the committed files, so a schema change committed
without regenerated types fails CI only if the stale types break a use site.

### 1.11 Tooling and CI

| Command | Runs | Use |
|---|---|---|
| `npm run dev` | `dev:api` and `dev:web` together via `concurrently` | Local development |
| `npm run dev:web` | `vite` on port 5173 | UI only |
| `npm run dev:api` | `scripts/dev-api.js`: `.venv\Scripts\python.exe -m server` | API only, port 5174 |
| `npm run build` | `tsc -b && vite build` into `dist/` | Type-check and bundle |
| `npm run lint` | `eslint .` | Lint TypeScript |
| `npm run validate` | `scripts/validate-packs.mjs` | Validate every pack file against its schema with ajv |
| `npm run check-refs` | `scripts/check-refs.mjs` | Cross-file pack checks (below) |
| `npm run gen-types` | `scripts/gen-pack-types.mjs` | Regenerate TypeScript types |
| `python -m server.db` | `server/db.py:242` | Create or migrate the database without starting the API |

`validate-packs.mjs` checks `pack.json` and each collection the manifest lists in
`provides`, and flags the `#/defs/` typo (should be `#/$defs/`) in any schema.
`check-refs.mjs` checks what one file cannot:

- every namespaced id an entry mentions is defined in some installed pack
- every `$choice:<id>` names a choice on the same entry
- every effect type is a core type or declared in a pack's `providesEffectTypes`
- no condition applies itself
- no spell list inherits from itself

Pass kinds to filter its report: `npm run check-refs -- spell feature`.

CI (`.github/workflows/validate.yml`) runs on pushes to `main` and on pull requests:
`npm ci`, `npm run validate`, `npm run build`. It does not run `check-refs`, `lint`, or any
Python step. The repo has no automated tests.

#### First run

```sh
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
npm install
npm run dev
```

The API prints a one-time setup link (or creates the admin from `QUILL_ADMIN_*`). Open it
to create the admin account. The UI is at `http://localhost:5173`.

### Status

**In progress.** The development stack (Vite + Flask + SQLite), migrations, record
validation and type generation are in use and stable. Deployment is not built: nothing
serves `dist/` alongside the API, and the API runs on Flask's built-in server.

### Open questions

- **Production serving.** Options: Flask serves `dist/` and the API from one process, or a
  reverse proxy serves `dist/` and forwards `/api` to a WSGI server such as gunicorn or
  waitress. Either way, `TRUSTED_HOSTS` is fixed to `localhost` and `127.0.0.1`
  (`server/__init__.py:39`) and must become configurable before Quill can run under a
  domain name.
- **Rate limits across processes.** Limits live in one process's memory and reset on
  restart (`server/ratelimit.py:9`). A multi-worker WSGI server would give each worker its
  own counts.
- **Docker.** `QUILL_PACKS_DIR` and `QUILL_ADMIN_*` are documented for Docker, but the repo
  has no Dockerfile.
- **Cross-platform dev script.** `scripts/dev-api.js:6` looks only for
  `.venv\Scripts\python.exe`, the Windows venv layout. On macOS and Linux the path is
  `.venv/bin/python`.
- **CI coverage.** Should CI also run `check-refs`, `lint`, a Python import check, and a
  `gen-types` diff that fails when generated files are stale?
- **Tests.** There are no unit tests for the rules engine. `check_draft` is the first
  candidate.
- **Pack version pinning.** `pack.schema.json` says campaigns pin a pack's `version`;
  nothing stores or reads a pinned version.
- **Stale comments.** `server/rules/__init__.py` lists 4 of the 12 rules modules;
  `server/rules/problems.py:1` names `useCampaignProblems.ts`, which no longer exists;
  `documents/Explanation.MD` describes an earlier server (`quill_data_layer.py`).
- **Router imports.** `src/main.tsx` imports from `react-router`, other files from
  `react-router-dom`. Pick one.
- **URL naming.** Campaign pages use `/campaign/:id` and `/campaignsettings/:id`, while
  the campaign wizard uses `/campaigns/:id/characters/new`.

### Future work

- **Planned:** a deployment setup (production server, static file serving, configurable
  trusted hosts, Dockerfile).
- **Planned:** pack hot-reload or an admin action that calls `packs.reload()`.
- **Planned:** campaign pack-version pinning.
- **Planned:** a rules-engine test suite run in CI.
- New route modules register in `server/__init__.py:59` and need an access decorator on
  every route. New pack collections need an entry in `SCHEMA_FOR_COLLECTION`
  (`scripts/validate-packs.mjs:11`) and in `CollectionEntries` (`src/packs/types.ts:23`).
  New stored records need a schema in `schemas/records/` and a `record_problems` call on
  every write.

---

## Chapter 2 — Accounts & Permissions

Quill has one admin, who runs the server and creates campaigns, and users, who join
through invite links. Inside a campaign each member is a GM or a player. The server
decides access on every request; the frontend hides controls but enforces nothing.

### 2.1 Account types and roles

There are two layers. An **account type** applies everywhere; a **campaign role** applies
inside one campaign.

| Layer | Value | Stored as | How someone gets it |
|---|---|---|---|
| Account type | Admin | `users.is_admin = 1` | First-run setup only (2.3) |
| Account type | User | `users.is_admin = 0` | Sign-up through an invite link (2.4) |
| Campaign role | GM | `memberships.role = 'gm'` | Creating the campaign (`server/routes/campaigns.py:65`) |
| Campaign role | Player | `memberships.role = 'player'` | Accepting an invite (`server/routes/invites.py:145`) |

What follows from the current code:

- Only the admin can create campaigns (`@require_admin` at `server/routes/campaigns.py:41`),
  so today every GM is the admin.
- Invites always grant the player role. No route promotes a player to GM or creates a
  second admin.
- The admin passes every GM check without a membership row: `is_gm` returns true for the
  admin on any existing campaign (`server/helpers.py:62`), and `@require_member` lets the
  admin through (`server/access.py:31`). Where the admin is not a member, campaign
  responses report `role: 'admin'` (`server/routes/campaigns.py:21`).

### 2.2 Permission matrix

**Owner** is the user who created the character or draft. "GM" includes the admin acting
through `is_gm`. Routes are under `/api`.

| Action | Route | Signed out | Player | GM | Admin |
|---|---|---|---|---|---|
| See whether setup is needed | `GET /setup` | ✓ | ✓ | ✓ | ✓ |
| Complete setup | `POST /setup` | With setup token | — | — | — |
| Read pack manifests | `GET /packs` | ✓ | ✓ | ✓ | ✓ |
| Read pack collections, default rules | `GET /packs/collections/*`, `GET /rules` | — | ✓ | ✓ | ✓ |
| Check an invite link | `GET /invites/<token>` | ✓ | ✓ | ✓ | ✓ |
| Sign up | `POST /auth/signup` | With invite token | — | — | — |
| Accept an invite | `POST /invites/<token>/accept` | — | ✓ | ✓ | ✓ |
| Export own account | `GET /account/export` | — | ✓ | ✓ | ✓ |
| Delete own account | `DELETE /account` | — | ✓ | ✓ | — |
| Create a campaign | `POST /campaigns` | — | — | — | ✓ |
| List campaigns | `GET /campaigns` | — | Joined | Joined | All |
| Read a campaign | `GET /campaigns/<id>` | — | Member | Member | Any |
| Change name, description, rules, allowed content | `PATCH /campaigns/<id>` | — | — | Own campaign | Any |
| Delete a campaign | `DELETE /campaigns/<id>` | — | — | Own campaign | Any |
| List members, remove a player | `/campaigns/<id>/members*` | — | — | Own campaign | Any |
| List, create, revoke invites | `/campaigns/<id>/invites`, `DELETE /invites/<token>` | — | — | Own campaign | Any |
| Create a Character Sandbox character | `POST /sandbox/characters` | — | ✓ | ✓ | ✓ |
| Create a campaign character | `POST /campaigns/<id>/characters` | — | Member | Member | Any campaign |
| Read, edit, roll, set portrait, delete a character | `/characters/<id>*` | — | Owner | Owner | Any |
| Create, read, edit, delete a draft | `/drafts*` | — | Owner | Owner | Owner |
| List and restore deleted accounts | `/admin/deleted-accounts*` | — | — | — | ✓ |

Read with the matrix:

- A GM cannot read a player's character. `own_character` admits only the owner and the
  admin (`server/routes/characters.py:268`). Party and GM visibility is **Planned**.
- Drafts are owner-only for everyone, the admin included (`own_draft`,
  `server/routes/drafts.py:128`).
- No route lets a player leave a campaign; only the GM can remove them, and the GM cannot
  be removed (`server/routes/campaigns.py:216`).

#### How a refusal looks

| Situation | Status | Body `error` |
|---|---|---|
| Not signed in on a non-public route | 401 | `Sign in first.` |
| Non-member on a campaign route | 404 | `Campaign not found` |
| Non-GM on a GM action | 404 | `Campaign not found` |
| Non-admin on an admin route | 404 | `Not found` |
| Someone else's character or draft | 404 | `Character not found` / `Draft not found` |

A signed-in user who lacks access gets the same 404 as for a missing record, so probing
ids reveals nothing (`server/access.py:29`, `:49`). The frontend turns a 401 into a
redirect to `/login?next=<path>` (`src/api/client.ts:10`), and the login page accepts only
same-site `next` paths (`src/routes/Login.tsx:14`).

### 2.3 First-run setup

The admin account is created once, before anyone can sign up.

| Path | Trigger | Where |
|---|---|---|
| Environment | `QUILL_ADMIN_USERNAME` and `QUILL_ADMIN_PASSWORD` set at startup | `server/routes/setup.py:66` |
| Setup link | Neither set: the server prints `<QUILL_PUBLIC_URL>/setup?token=<token>` to its own output | `server/routes/setup.py:88` |

The setup token is 32 random bytes. The server keeps only its SHA-256 hash, in process
memory (`server/routes/setup.py:21`), compares it in constant time, and clears it after
one use; a restart prints a new link. Setup is needed while no admin has a password
(`server/routes/setup.py:28`). An admin row with no password, left from older versions, is
taken over instead of duplicated, so it keeps its campaigns (`server/routes/setup.py:36`).

### 2.4 Sign-up and sign-in

| Rule | Value | Where |
|---|---|---|
| Sign-up | Invite-only; makes a user and a player membership in the invite's campaign | `server/routes/auth.py:34` |
| Username | 3–32 of `A–Z a–z 0–9 _ . -`; unique ignoring case (`COLLATE NOCASE`) | `server/routes/auth.py:15`, `server/db.py:16` |
| Display name | 1–64 characters after collapsing whitespace; no control characters | `server/helpers.py:21` |
| Password | 8–128 characters, hashed with Werkzeug's `generate_password_hash` (scrypt) | `server/routes/auth.py:16` |
| Unknown username | Checked against a dummy hash, so it takes as long as a wrong password | `server/routes/auth.py:20` |
| Failed sign-in message | `Wrong username or password.` for either mistake | `server/routes/auth.py:108` |

Sign-up spends one use of the invite in the same transaction as the user insert
(`claim_invite`, `server/routes/invites.py:26`). A taken username rolls the transaction
back and returns the use. `claim_invite` is a single `UPDATE ... RETURNING` statement, so
two people cannot both take an invite's last use.

A signed-in user who accepts an invite to a campaign they already belong to gets the
campaign id back and spends no use (`server/routes/invites.py:135`). Chapter 3 covers
invite expiry, use limits and revocation.

### 2.5 Sessions

A *session cookie* is a value the browser sends with every request so the server knows
who is calling. Quill uses Flask's built-in session: a cookie signed with the secret key,
holding only `user_id`.

| Property | Value | Where |
|---|---|---|
| Contents | `user_id` only | `server/helpers.py:55` |
| Signing key | `QUILL_SECRET_KEY`, else config, else `data/secret_key` | `server/config.py:39` |
| Lifetime | `lifetime_days`, default 30 (`session.permanent = True`) | `server/__init__.py:32` |
| `HttpOnly` | On: page scripts cannot read it | `server/__init__.py:33` |
| `SameSite` | `Lax`: not sent on cross-site POST, PUT, PATCH or DELETE | `server/__init__.py:34` |
| `Secure` | From `secure_cookies`; off by default | `server/__init__.py:35` |
| Per request | `g.user` loaded from the cookie; a cookie for a deleted account is cleared | `server/__init__.py:50` |
| Sign-in | Clears the old session before writing the new id | `server/helpers.py:55` |
| Sign-out | Clears this browser's cookie only | `server/routes/auth.py:114` |

The server keeps no list of sessions. A cookie stays valid until it expires, its account
is deleted, or the secret key changes; changing the key signs everyone out. There is no
"sign out everywhere".

### 2.6 Account export

`GET /account/export` downloads `quill-account-<username>.json`: the user row without the
password hash, memberships with campaign names, and every character with its sheet,
personal notes and portrait as base64 WebP (`server/routes/account.py:21`, `:80`). Drafts
are not included.

### 2.7 Account deletion and snapshots

`DELETE /account` takes `{mode, confirm}`. The account page asks for the confirm text in
a `TypeToConfirmDialog` (`src/routes/AccountSettings.tsx:71`), and the server checks it
again.

| Mode | Confirm text | Keeps | Disk handling |
|---|---|---|---|
| `snapshot` | The username | A copy in `deleted_accounts` for 30 days, password hash included | Normal delete |
| `erase` | `All data completely removed` (`server/routes/account.py:14`) | Nothing; any older snapshot of the account is deleted too | `PRAGMA secure_delete = ON`, then a WAL checkpoint so no copy stays in the log |

Both modes then delete the `users` row, and `ON DELETE CASCADE` removes memberships,
characters, portraits and drafts. The server refuses:

- the admin account (403);
- an account that owns a campaign or created an invite (409). Only the admin can own
  either today, so this guards a future change (`server/routes/account.py:121`);
- a sixth attempt within an hour from one IP (429).

#### Restore

`POST /admin/deleted-accounts/<id>/restore` (`server/routes/admin.py:49`) rebuilds the
account from its snapshot in one transaction.

| Item | Restored when |
|---|---|
| User, with original id, password hash and `created_at` | The username and id are both free; otherwise 409 |
| Membership | Its campaign still exists |
| Campaign character, with notes and portrait | Its campaign still exists |
| Character Sandbox character | Always |
| Drafts | Never: snapshots do not contain them |

The response names the skipped campaigns and counts the skipped characters, and the Admin
page shows both (`src/routes/Admin.tsx:13`). A restore deletes the snapshot.

#### Expiry

A snapshot is restorable for 30 days (`SNAPSHOT_DAYS`, `server/routes/account.py:15`).
The admin list and restore both filter on that window in SQL
(`server/routes/admin.py:14`), so expiry is exact whether or not cleanup has run. A
background thread deletes expired snapshots at startup and every 24 hours, with
`secure_delete` on (`server/routes/account.py:46`).

### 2.8 Rate limits

Limits are sliding windows held in server memory and keyed by client IP
(`server/ratelimit.py:28`). Every request counts, successful or not. Over a limit, the
server answers 429 with a `Retry-After` header in seconds and the error
`Too many requests. Try again later.`

| Bucket | Limit | Applies to | Where |
|---|---|---|---|
| `api` | 300 / minute | Every `/api` request | `server/__init__.py:11` |
| `login` | 10 / 15 min per IP | Sign-in | `server/routes/auth.py:88` |
| `login-user` | 5 / 15 min per username, across all IPs | Sign-in | `server/routes/auth.py:95` |
| `signup` | 5 / hour | Sign-up | `server/routes/auth.py:33` |
| `setup` | 10 / hour | Setup completion | `server/routes/setup.py:109` |
| `invite-check` | 30 / 10 min | Checking an invite link | `server/routes/invites.py:108` |
| `invite-accept` | 10 / hour | Accepting an invite | `server/routes/invites.py:129` |
| `draft-create` | 60 / hour | New drafts | `server/routes/drafts.py:111` |
| `ability-roll` | 60 / hour, shared by draft and character rolls | Ability rolls | `server/routes/drafts.py:155`, `server/routes/characters.py:368` |
| `portrait-upload` | 30 / hour | Portrait uploads | `server/routes/characters.py:407` |
| `character-delete` | 30 / hour | Character deletion | `server/routes/characters.py:450` |
| `account-delete` | 5 / hour | Account deletion | `server/routes/account.py:99` |

To limit a route, add `@limit('<bucket>', max_requests, window_seconds)` below its access
decorator. Two routes with the same bucket name share one count.

### Status

**In progress.** Setup, invite-only sign-up, sign-in, sessions, the access decorators,
export, deletion, snapshots and restore are built and in use. Role management, account
editing and party visibility are not built.

### Open questions

- **More GMs.** Should users other than the admin create campaigns, and should a GM be
  able to promote a player? Either changes the matrix and the ownership check in account
  deletion.
- **Leaving a campaign.** Players cannot leave on their own. Add a route, or keep removal
  GM-only?
- **GM view of characters.** What may a GM see of a player's character, and may they edit
  it? `own_character` is the one place to change.
- **Drafts in snapshots.** A restored account loses its drafts. Add them to
  `collect_account`?
- **Unused soft-delete columns.** `users.deleted_at` and `characters.deleted_at` exist and
  queries filter on them, but deletion removes rows outright. Drop them in a migration or
  start using them.
- **Revoking sessions.** A stolen cookie works until it expires. Server-side sessions or a
  per-user session counter would allow "sign out everywhere".
- **Client IP behind a proxy.** Limits key on `request.remote_addr`. Behind a reverse proxy
  every request has the proxy's IP, so one user could use up everyone's limits. Werkzeug's
  `ProxyFix` is the fix once a deployment exists (Chapter 1).
- **Revoke by id or token.** `DELETE /invites/<token>` matches either the token's hash or
  the invite id (`server/routes/invites.py:161`). Document the id form or split the route.

### Future work

- **Planned:** change password; change display name.
- **Planned:** admin-side password reset.
- **Planned:** party visibility rules for characters.
- **Planned:** personal notes in the API. `characters.personal_notes` is stored, exported
  and restored, but no route reads or writes it.
- **Planned:** GM promotion and campaign ownership transfer.
- A new route needs an access decorator (1.5), a row in the permission matrix above, and
  a rate limit if it creates rows, rolls dice or accepts uploads.
