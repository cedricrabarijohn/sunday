# Architecture

A tour of how Sunday is wired together. Pair this with the code in `src/lib`,
which holds the server-side logic.

## Overview

Sunday is a Next.js (App Router) monolith. Pages are server components that load
data with Drizzle and hand it to client components; mutations go through
`app/api/**` route handlers. There is no separate backend — the API routes _are_
the backend.

```
Browser ──HTTP──> Next.js route handlers ──Drizzle──> MariaDB
   │                      │
   └──SSE (EventSource)───┘ (real-time fan-out, in-process pub/sub)
                          └──nodemailer──> SMTP
                          └──S3 SDK──────> object storage (attachments)
```

## Authentication & sessions

- **Sessions** are stateless JWTs (`jose`, HS256) stored in an `httpOnly`,
  `SameSite=Lax` cookie (`sunday_session`). The cookie is `Secure` when
  `NODE_ENV=production`. See `src/lib/auth.ts`.
- The signing key (`JWT_SECRET`) is validated at boot: in production the app
  throws if it's the shipped placeholder or shorter than 32 chars.
- Passwords are hashed with **bcrypt** (`bcryptjs`).
- `requireAuth()` (`src/lib/require-auth.ts`) gates API routes and returns the
  session (`{ sub, email }`).
- A second, **non-cookie** auth path exists for the programmatic API: the MCP
  endpoint authenticates **personal access tokens** instead of the session
  cookie. See [Programmatic API](#programmatic-api-mcp-server).

### Single-use tokens

`auth_tokens` (`src/lib/auth-tokens.ts`) backs both **password reset** and
**email verification**. `createAuthToken(userId, purpose, ttl)` issues a token;
`consumeAuthToken(token, purpose)` validates it (right purpose, unused,
unexpired) and burns it (single use).

### Auth flows

| Flow | Routes | Pages |
|------|--------|-------|
| Sign in / up | `api/auth/login`, `api/auth/register` | `users/sign_in`, `users/sign_up` |
| Password reset | `api/auth/forgot-password`, `api/auth/reset-password` | `users/forgot_password`, `users/reset_password` |
| Email verification | `api/auth/verify-email`, `api/auth/send-verification` | `users/verify_email` |
| Account settings | `api/me` (PATCH), `api/auth/change-password` | `me/settings` |

Auth endpoints are **rate-limited** per IP (`src/lib/rate-limit.ts`).

## Authorization (RBAC)

Two tiers, both in `src/lib/workspace-access.ts` + `src/lib/board-access.ts`:

- **Workspace capabilities** — e.g. `view_workspace`, `manage_members`,
  `manage_labels`. Resolved from the user's **workspace role**
  (admin / member).
- **Board capabilities** — `view_board`, `edit_board`, `delete_board`,
  `manage_board_members`, `manage_piles`, `create_card`, `edit_card`,
  `delete_card`. Resolved from the user's **board role**, with **workspace-admin
  escalation**: a workspace admin implicitly holds every board cap.

API routes guard with helpers that load the relevant entity _and_ check a cap in
one call: `requireWorkspaceCap`, `requireBoardCap`, `requireCardCap`,
`requirePileCap`, `requireLabelCap`, `requireItemCap`, `requireAttachmentCap`.
Each returns either the loaded row + capability set, or a ready-made
`401/403/404` response.

> Managing the workspace **label catalog** (create/edit/delete labels) is a
> workspace cap (`manage_labels`); **assigning** an existing label to a card is a
> board cap (`edit_card`). The UI hides catalog actions when the user lacks
> `manage_labels`.

> **Integrations** (the Gitea connection) are gated by the `manage_members`
> workspace cap — both the settings page (`notFound()` otherwise) and the
> `api/workspaces/[id]/integrations/gitea` routes (`requireWorkspaceCap`). The
> "Integrations" links in the workspace header and the board header render only
> when the user holds that cap, but the server enforces it independently.

> **Custom fields** are board-scoped: defining/renaming/deleting a field needs
> `edit_board`; setting a field's value on a card needs `edit_card`.

## Real-time (Server-Sent Events)

Two in-process pub/sub buses, each a module singleton pinned to `globalThis`
(HMR-safe), mirror the DB-pool pattern:

- **`src/lib/board-bus.ts`** — one channel per board. Events: `card_created`,
  `card_moved` (with authoritative ordering), `card_updated`, `card_deleted`,
  `card_labels`, `card_assignees`, `card_counts`, `pile_created`,
  `pile_updated`, `pile_deleted`, `piles_reordered`, and the custom-field
  events `column_created`, `column_updated` (each carrying the whole column so
  any open board can add/retype it live) and `column_deleted` (the column id).
- **`src/lib/card-bus.ts`** — one channel per card, for comment events.

Clients connect with `EventSource` to `api/boards/[id]/stream` and
`api/cards/[id]/stream`. Mutation routes call `publishBoard(...)` /
`publishCard(...)` after writing.

**Design principle — idempotent authoritative events.** Every event carries
enough data that a client re-applying its own echo is a no-op. The one
non-idempotent case (create) is handled with a dedupe-safe temp→real id swap.
This avoids any client-id bookkeeping. Counts are recomputed server-side
(`src/lib/card-counts.ts`) using the same soft-delete filters as the initial
page load, so live numbers always match a fresh fetch.

> This bus is **in-process**: it only fans out within a single server instance.
> See the scaling roadmap in [DEPLOYMENT.md](./DEPLOYMENT.md#scaling-roadmap).

## Storage (attachments)

`src/lib/storage` is a small driver abstraction (`STORAGE_DRIVER`):

- `local-disk.ts` — **the default.** Writes to `public/uploads/`, served
  straight by Next. No extra services; ideal for self-hosted single-instance
  installs. MinIO sits behind the `s3` Compose profile, so it does not even run
  unless you opt in.
- `s3.ts` — optional S3-compatible store (MinIO / S3 / R2 / Spaces), for scale
  or multi-instance. With MinIO the bucket is created and made public-read by
  the `minio-init` one-shot container (`make start-s3`).

Uploads go through `api/cards/[id]/attachments`; the public URL is stored on the
attachment row and embedded directly (including inline images in descriptions).

## Email

`src/lib/mail.ts` builds a `nodemailer` SMTP transport from env and exposes a
single best-effort `sendMail(...)`. Templates are dependency-free inline-styled
HTML in `src/lib/mail-templates.ts` (invite, password reset, email verification,
notification). All sends are fire-and-forget — failures are logged, never thrown.

## Notifications

`src/lib/notify.ts` is the single fan-out point (`emitNotifications`). It writes
`notifications` rows (skipping self-notifications) **and**, in the background,
emails each recipient. Notification emails reuse the card deep link
(`/boards/:id?card=:cardId`) so clicking one opens straight to the card.

## Custom fields

A board can define extra typed columns beyond the built-ins. `src/lib/fields.ts`
owns the type system — `text`, `number`, `select`, `multi_select`, `date`,
`checkbox`, `url` — with `normalizeConfig` (e.g. generating stable ids for
select options) and `coerceValue` (validating a value against its type/config).

- **Definitions** live in `board_columns` (`label`, `type`, `config`,
  `position`); **per-card values** in `board_task_columns` (unique on
  `board_column_id` + `board_task_id`, upserted on write).
- Both `config` and `value` are JSON columns. MariaDB's driver returns them as
  strings, so reads go through `parseConfig` / `parseValue` before use.
- Routes: `api/boards/[id]/columns` (list/create), `api/columns/[id]`
  (rename/retype/soft-delete), `api/cards/[id]/columns/[columnId]` (set/clear a
  value). The table view renders typed inline editors per column.

## Integrations (SCM)

An **optional, opt-in** SCM integration links commits and pull requests to
cards. **Gitea, Forgejo, GitHub, GitLab and Bitbucket** are supported. It is
invisible until a workspace admin connects a provider — nothing about it appears
for workspaces that never do.

- **Connection**: one `scm_connections` row per workspace+provider (a workspace
  can connect several at once), created from the Integrations settings page. It
  holds the provider, a `base_url`, a random `webhook_token` (routes the inbound
  URL), a `secret` (verifies it), an `enabled` flag (Pause), and an optional
  `done_pile_name` (auto-move target).
- **Inbound webhook**: `api/webhooks/<provider>/[token]` takes no session. Each
  provider has a thin route that hands off to the shared receiver in
  `src/lib/scm-webhook.ts`. It finds the connection by token+provider (404 if
  unknown or paused — never revealing which), **verifies the signature** with the
  provider's scheme (Gitea/Forgejo `X-Gitea-Signature` HMAC, GitHub/Bitbucket
  `X-Hub-Signature(-256)` HMAC, GitLab `X-Gitlab-Token` constant-time compare;
  401 otherwise), then normalizes the push / pull-request payload and parses
  `#cardId` refs out of commit messages / PR titles+bodies (`src/lib/scm.ts`).
  Links are upserted into `card_links`.
- **Workspace isolation**: the receiver only ever touches cards whose board
  belongs to the connection's own workspace (`INNER JOIN boards … WHERE
  boards.workspace_id = conn.workspace_id`). A webhook for one workspace can
  never reach another's cards.
- **Auto-move on merge**: when a merged PR references a card and the connection
  has a `done_pile_name`, `src/lib/card-move.ts` moves that card to the
  matching pile in its own board, re-packs both piles, and publishes a
  `card_moved` event so open views update live. Best-effort — a move failure
  never fails the webhook.

Linked commits/PRs are shown in a "Linked code" section on the card drawer.

## Programmatic API (MCP server)

Sunday ships a built-in **MCP server** at `api/mcp/route.ts` — a single
JSON-RPC endpoint (`tools/list`, `tools/call`) that exposes the app's actions
(boards, piles, cards, comments, labels, custom fields) as tools to agents and
scripts. The tool implementations live in `src/lib/mcp/tools.ts` and reuse the
**same RBAC helpers** as the web routes, so a token can never do more than its
owner could in the UI; mutations publish the same SSE events, so MCP-driven
changes show up live in open boards.

- **Auth — personal access tokens** (`src/lib/api-tokens.ts`): the endpoint
  authenticates a `Authorization: Bearer sun_pat_…` token. Tokens are
  long-lived, optional-TTL, and only stored as a **SHA-256 hash** — the
  plaintext is shown once at creation and never again. The `sun_pat_` prefix
  makes leaked tokens easy for secret scanners to catch. Backed by the
  `api_tokens` table.
- **Management**: users mint and revoke tokens on the account settings page
  (`me/settings`), via `api/me/tokens` (list/create) and `api/me/tokens/[id]`
  (revoke). The settings page also surfaces the MCP URL (`<APP_URL>/api/mcp`).

## Data model

The schema is in `src/db/schema.ts`. Roughly:

- **Identity & access**: `users`, `workspaces`, `workspace_users`,
  `workspace_roles` / `workspace_role_capabilities`, `boards`, `board_users`,
  `board_roles` / `board_role_capabilities`, `auth_tokens`.
- **Board content**: `board_piles`, `board_tasks` (cards), `board_task_items`
  (checklist), `board_task_assignees`, `board_task_labels`, `labels`,
  `board_task_attachments`, `board_task_comments`.
- **Custom fields**: `board_columns` (field definitions), `board_task_columns`
  (per-card values).
- **Integrations**: `scm_connections` (per-workspace, per-provider SCM config),
  `card_links` (commits/PRs linked to a card).
- **Programmatic access**: `api_tokens` (hashed personal access tokens).
- **Invites & notifications**: `workspace_invites`, `board_invites`,
  `notifications`.

Soft deletes use `deleted_at`; count queries filter on it consistently so the
initial render and live updates agree.

## Internationalization

`next-intl` with messages in `src/messages` and routing under `app/[locale]`.
