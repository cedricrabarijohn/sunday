# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sunday is a small, self-hostable project-management tool (workspaces → boards → cards,
kanban + table views, real-time sync). It's a **Next.js 16 App Router monolith**: pages are
server components that load data with Drizzle; all mutations go through `src/app/api/**`
route handlers — **the API routes _are_ the backend**, there is no separate service.

## Commands

The package manager is **bun** (`bun.lockb`). The whole stack runs in Docker via the Makefile.

```bash
make start            # build + start app + MariaDB + MinIO + Mailpit (detached)
make start-f          # same, foreground (logs in terminal)
make start-s3         # add the bundled MinIO (only needed when STORAGE_DRIVER=s3)
make stop / make kill

bun run dev           # dev server (what the app container runs)
bun run build         # production build — must pass before a PR
bun run lint          # eslint — must pass
npx tsc --noEmit      # type-check (strict; no `any` unless unavoidable)
```

Ports: app `http://localhost:3000`, Mailpit (captured dev email) `http://localhost:8025`,
MinIO console (s3 profile) `http://localhost:9001`.

There is **no test runner** in this repo — no `test` script and no test framework.
Verify changes with `lint` + `tsc --noEmit` + `build`, and by driving the app.

### Database (Drizzle Kit, MariaDB)

Schema lives in `src/db/schema.ts`. Never hand-edit the DB — always migrate.

```bash
bun run db:generate   # after editing src/db/schema.ts → writes drizzle/NNNN_*.sql
bun run db:migrate    # apply migrations
make db-migrate       # apply migrations inside Docker
make db-seed          # seed RBAC reference data (roles/capabilities) from sql/seed.sql
make db               # open a mariadb shell in the db container
```

Running `db:*` from the host needs `DB_HOST=localhost` (Compose publishes 3306; inside the
Docker network the host is `db`). RBAC roles/capabilities are **reference data** that must be
seeded — a fresh DB needs `make db-seed` or the seed shipped in migration `0005`.

## Architecture

Read `docs/ARCHITECTURE.md` for the full tour. The load-bearing pieces:

- **Auth** (`src/lib/auth.ts`): stateless JWT (`jose`, HS256) in an httpOnly cookie
  `sunday_session`; bcrypt passwords. `requireAuth()` (`src/lib/require-auth.ts`) gates API
  routes. `JWT_SECRET` is validated at boot (production throws if placeholder or < 32 chars).
  Single-use `auth_tokens` (`src/lib/auth-tokens.ts`) back password reset + email verification.

- **RBAC — two tiers, enforced server-side** (`src/lib/workspace-access.ts`,
  `src/lib/board-access.ts`): workspace caps (from workspace role admin/member) and board caps
  (from board role, **with workspace-admin escalation**). API routes guard with helpers that
  load the entity _and_ check a cap in one call: `requireWorkspaceCap`, `requireBoardCap`,
  `requireCardCap`, `requirePileCap`, `requireLabelCap`, `requireItemCap`,
  `requireAttachmentCap` — each returns the loaded row + cap set, or a ready-made 401/403/404.
  **Never bypass these.** Note: managing the label catalog is a workspace cap (`manage_labels`);
  assigning a label to a card is a board cap (`edit_card`).

- **Real-time — two in-process pub/sub buses** (`src/lib/board-bus.ts` per board,
  `src/lib/card-bus.ts` per card). Each is a module singleton pinned to `globalThis` (HMR-safe).
  Clients connect via `EventSource` to `api/boards/[id]/stream` / `api/cards/[id]/stream`.
  **After any mutation, publish the matching event** (`publishBoard` / `publishCard`) so other
  viewers stay in sync. Events are designed **idempotent + authoritative**: each carries enough
  data that a client re-applying its own echo is a no-op; counts are recomputed server-side
  (`src/lib/card-counts.ts`) with the same soft-delete filters as the initial load. This bus
  only fans out within a single server instance (see the scaling roadmap in DEPLOYMENT.md).

- **Storage** (`src/lib/storage/`): driver abstraction on `STORAGE_DRIVER`. `local-disk.ts` is
  the default (writes to `public/uploads/`, served by Next); `s3.ts` is optional S3-compatible.

- **Custom fields** (`src/lib/fields.ts`): typed per-board columns
  (`text`/`number`/`select`/`multi_select`/`date`/`checkbox`/`url`). Definitions in
  `board_columns`, per-card values in `board_task_columns`; both `config` and `value` are JSON
  columns that MariaDB's driver returns as **strings** — reads must go through
  `parseConfig`/`parseValue`, writes through `normalizeConfig`/`coerceValue`.

- **SCM integrations** (`src/lib/scm-webhook.ts`, `src/lib/scm.ts`): optional, opt-in per
  workspace (Gitea/Forgejo/GitHub/GitLab/Bitbucket). Inbound webhook at
  `api/webhooks/<provider>/[token]` takes no session — it verifies the provider's signature
  scheme, then parses `#cardId` refs. **Workspace isolation is enforced by SQL** (only touches
  cards whose board belongs to the connection's own workspace). Merged PRs can auto-move a card
  via `src/lib/card-move.ts`.

- **Programmatic API — built-in MCP server** at `src/app/api/mcp/route.ts` (JSON-RPC:
  `tools/list`/`tools/call`). Tools live in `src/lib/mcp/tools.ts` and **reuse the same RBAC
  helpers** as the web routes, and publish the same SSE events. Auth is via personal access
  tokens (`sun_pat_…`, `src/lib/api-tokens.ts`) stored only as SHA-256 hashes.

- **Soft deletes** use `deleted_at`; count/list queries filter on it consistently so initial
  render and live updates agree.

## Conventions

- **Styling**: SCSS modules + CSS-variable theme tokens (`--surface`, `--text-1`, `--accent`, …).
  **Never hard-code colors** — light/dark themes rely on the tokens. Theme is set on
  `<html data-theme>` by an inline script in `layout.tsx` before hydration.
- **Email is always best-effort** (`src/lib/mail.ts`, fire-and-forget) — a delivery failure must
  never break the action that triggered it. `src/lib/notify.ts` is the single notification
  fan-out point (writes rows + emails, skipping self-notifications).
- Auth endpoints are rate-limited per IP (`src/lib/rate-limit.ts`, in-process).
- Commit subjects are imperative + scoped: `fix(board): …`, `feat(auth): …`.

## Routing note

There is **no i18n / `next-intl`** in this codebase. Routes live directly under `src/app/`
(e.g. `src/app/boards/[id]/`, `src/app/workspaces/`, `src/app/me/`) — there is no `[locale]`
segment and no `src/messages`. `layout.tsx` is a single root layout with `lang="en"`.
