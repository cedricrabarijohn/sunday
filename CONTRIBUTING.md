# Contributing to Sunday

Thanks for taking the time to contribute! This guide gets you from clone to
pull request.

## Getting started

You need **Docker**. The whole stack (app, MariaDB, MinIO, Mailpit) runs in
containers.

```bash
git clone https://github.com/Wikolabs/sunday.git
cd sunday
cp .env.example .env
# set a strong JWT_SECRET in .env:  openssl rand -base64 48
make start          # or: make start-f  (foreground)
```

- App: <http://localhost:3000>
- Mail (dev): <http://localhost:8025>

`make` with no target lists every command.

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full tour. In short:

- `src/app/` — App Router pages
- `src/app/api/` — route handlers (the backend)
- `src/components/` — UI (atoms / molecules / organisms)
- `src/lib/` — server logic: auth, RBAC, realtime buses, mail, …
- `src/db/schema.ts` — database schema (Drizzle)

## Development workflow

```bash
bun run lint          # eslint — must pass
bun run build         # production build — must pass before a PR
npx tsc --noEmit      # type-check
```

### Database changes

The schema lives in `src/db/schema.ts` and is managed with Drizzle Kit.
After editing it:

```bash
bun run db:generate   # writes a migration to drizzle/
bun run db:migrate     # applies it (use DB_HOST=localhost from the host)
```

Never hand-edit the production schema — always go through a migration.

### Screenshots (README)

`scripts/screenshots.mjs` regenerates the README images from the running app:

```bash
JWT_SECRET=$(grep ^JWT_SECRET= .env | cut -d= -f2-) node scripts/screenshots.mjs
```

## Conventions

- **TypeScript**, strict. No `any` unless truly unavoidable.
- **Styling**: SCSS modules + CSS variables (theme tokens like `--surface`,
  `--text-1`, `--accent`). Never hard-code colors — themes rely on the tokens.
- **API routes** guard with the capability helpers in `src/lib/workspace-access.ts`
  (`requireBoardCap`, `requireCardCap`, …). Don't bypass RBAC.
- **Realtime**: after a mutation, publish the matching event on the board/card
  bus so other viewers stay in sync.
- Match the style of the surrounding code (naming, comment density, idioms).

## Commits & pull requests

- Write clear, imperative commit subjects (`fix(board): …`, `feat(auth): …`).
- Keep PRs focused; describe what changed and why.
- Make sure `bun run lint` and `bun run build` pass.
- Link any related issue.

## Reporting bugs / requesting features

Open an issue using the templates under `.github/ISSUE_TEMPLATE/`. Include
steps to reproduce, expected vs actual behavior, and your environment.
