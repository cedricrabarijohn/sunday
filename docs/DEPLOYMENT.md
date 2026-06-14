# Deployment

How to ship Sunday safely, and how to scale it later.

## Production checklist

### 🔴 Hard requirements (do these before any public deploy)

1. **Real secrets.** Replace every placeholder in `.env`:
   - `JWT_SECRET` — strong & unique (`openssl rand -base64 48`). The app
     **refuses to boot** in production with the placeholder or a `< 32` char
     value.
   - `DB_PASSWORD`, `DB_ROOT_PASSWORD` — not `password`.
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — **only if** `STORAGE_DRIVER=s3`
     (not `minioadmin`). The default `local` driver needs no object store.
   - Keep the real `.env` **out of git** (it's gitignored; only `.env.example`
     is tracked).
2. **`NODE_ENV=production` at runtime.** Otherwise the session cookie is sent
   without the `Secure` flag. Run the app with `bun run build` then
   `bun run start` (the Compose `app` service already branches on `APP_ENV`).
3. **HTTPS.** Terminate TLS in front of the app (the repo already uses Traefik).
   The `Secure` session cookie requires it.
4. **Real SMTP.** Point `SMTP_*` at a real provider, set `SMTP_USER/PASSWORD` and
   `SMTP_SECURE=true` (port 465), set a real `MAIL_FROM` and the public
   `APP_URL`. Configure **SPF / DKIM / DMARC** on the sending domain or mail
   lands in spam. **Do not run Mailpit in production.**
5. **Migrations.** Provision the schema with `bun run db:migrate` against the
   production DB (see below). Don't hand-edit production schema.

### 🟠 Strongly recommended

- **Backups.** Automated MariaDB dumps + a tested restore (`make db-dump` /
  `make db-restore` are a starting point, not a backup strategy).
- **Monitoring / error tracking.** Today the app only `console.error`s. Wire up
  something like Sentry and structured logs.
- **Declare the performance indexes in `schema.ts`** (see gotcha below) so fresh
  deploys aren't missing them.
- **Raise the DB connection pool.** `src/db/client.ts` uses
  `connectionLimit: 10`; make it env-configurable and larger.
- Decide whether to **enforce email verification** (currently informational, not
  blocking).
- Remove dev-only data (e.g. the "Stress Test" demo board).

### Integrations (Gitea webhooks)

The optional Gitea integration receives webhooks at
`/api/webhooks/gitea/<token>`. If you use it:

- **`APP_URL` must be the public URL.** The webhook URL shown to admins (to paste
  into Gitea) is built from it; a wrong value yields an unreachable hook.
- **Keep that path publicly reachable** from your Gitea server through the
  reverse proxy. It needs **no auth allowlist** — it authenticates itself via the
  secret `token` in the URL plus the `X-Gitea-Signature` HMAC. Unknown/paused
  tokens get `404`, bad signatures `401`.
- No extra env or open ports are required; the integration is dormant until a
  workspace admin connects it.

## Migrations in production

```bash
# From a host/CI runner that can reach the DB:
DB_HOST=<db-host> DB_PORT=3306 DB_USER=<user> DB_PASSWORD=<pass> DB_NAME=<db> \
  bun run db:migrate
```

A fresh database applies `drizzle/0000_baseline.sql` (the full schema), then the
later migrations — including `0005_seed_rbac.sql`, which seeds the RBAC
reference data (roles, capabilities and their mappings). **Without that seed a
new workspace's admin holds no capabilities and cannot even create a board**, so
a fresh install must run the migrations through `0005`. The seed is idempotent
(`ON DUPLICATE KEY UPDATE` / `INSERT IGNORE`); to (re-)apply it on its own —
e.g. to heal a database seeded before this fix — run `make db-seed` (it pipes
`sql/seed.sql` into the db container) or apply `sql/seed.sql` directly.

For an existing database already at this schema, baseline it once by inserting
the baseline row into `__drizzle_migrations` so `db:migrate` treats it as applied
(the dev DB is already baselined).

### ⚠️ Index gotcha

The live database carries performance indexes (on `board_tasks.board_id`,
`pile_id`, `notifications.user_id` / `created_at`, assignees/labels join columns,
etc.) that are **not declared in `src/db/schema.ts`**. A database created purely
from the current migrations will be **missing them** and will be slow under load.

**Fix:** add the indexes to the table definitions in `schema.ts`
(`index(...).on(...)`), run `bun run db:generate`, and ship the resulting
migration before going to scale.

## Scaling roadmap

Sunday is **single-instance** today. That comfortably serves a launch (hundreds
to low thousands of concurrent users) on one decent server. Do **not** build the
items below until metrics demand them — premature scaling is wasted effort.

When you do grow, here is what breaks first, in order:

| # | Bottleneck | Why it breaks horizontally | Fix |
|---|-----------|----------------------------|-----|
| 1 | **Real-time SSE pub/sub** (`board-bus`/`card-bus`, `globalThis` singletons) | A publish on instance A never reaches SSE clients on instance B → live sync silently breaks across instances | Shared pub/sub: Redis Pub/Sub, NATS, or a managed real-time service |
| 2 | **Rate limiter** (`src/lib/rate-limit.ts`, in-memory) | Per-instance counters → ineffective across instances | Move counters to Redis |
| 3 | **SSE connection count** | Many persistent connections held in memory per instance | More instances + (1) |
| 4 | **Single MariaDB**, `connectionLimit: 10` | One node, tiny pool | Bigger pool + a pooler, read replicas, eventually sharding |
| 5 | **Inline notification emails** | No queue → traffic spikes are unbounded | Job queue + workers (e.g. BullMQ/Redis) |
| 6 | **Notification polling** (bell polls every 60s) | N users × constant polling | Push over SSE/WebSocket |
| 7 | **No caching layer** | Every request hits the DB | Cache hot reads |

The only **structural** change is (1) — getting the real-time fan-out out of the
process. Everything else is incremental and can wait until the numbers say so.
