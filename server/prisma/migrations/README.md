# Prisma migrations — switch-over instructions

Audit R-2026-05-22 finding (ultrathink overlay):

> **`prisma db push` works ONLY because you have 0 real users.** Any schema
> error after the first real user = data loss without rollback path. Need
> to start using `prisma migrate dev` **before** the first real user. Now
> is free; later is expensive.

This folder ships **but is not yet applied** to the Neon database. The
files are baseline snapshots so the switch can happen with one command
when you're ready.

## What's here

| File | What |
|---|---|
| `migration_lock.toml` | Pins the migration provider to `postgresql`. |
| `0_baseline/migration.sql` | Full CREATE TABLE/ENUM/INDEX SQL for every model in the current `schema.prisma`. Generated via `prisma migrate diff --from-empty --to-schema-datamodel`. |

## Current state of the project

- `package.json` script: `"prisma:migrate"` is **commented out** in
  CLAUDE.md (`# НЕ запускать: npm run prisma:migrate`). The project uses
  `npx prisma db push` to sync schema changes without migration files.
- Every Neon database operation goes through `db push` — no migration
  history exists in the `_prisma_migrations` table.
- This baseline does NOT touch the Neon database. Nothing in this folder
  has been executed against the production schema yet.

## Switch-over recipe (one-time, when ready)

**Pre-flight (do NOT skip):**

1. **Take a database snapshot.** Neon dashboard → branch from main →
   keep as `pre-migrate-switch-YYYY-MM-DD`. Free tier supports branches.
2. **Verify the baseline matches the live schema.** Run a dry-run diff
   against the actual Neon DB:
   ```bash
   cd server
   npx prisma migrate diff \
     --from-url "$DATABASE_URL" \
     --to-schema-datamodel prisma/schema.prisma \
     --script
   ```
   Output should be **empty** (no SQL). If it shows changes, the
   baseline is stale — regenerate it from the CURRENT schema before
   continuing:
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_baseline/migration.sql
   ```

**Apply baseline as "already done" (no DB changes):**

3. Mark the baseline as already applied — this writes a row to
   `_prisma_migrations` without re-running the SQL:
   ```bash
   cd server
   npx prisma migrate resolve --applied 0_baseline
   ```
4. Verify: `npx prisma migrate status` should report
   `Database schema is up to date!` with `0_baseline` listed as applied.

**From here on:**

5. **Stop using `db push`.** Schema changes go through:
   ```bash
   npx prisma migrate dev --name describe-your-change
   ```
   This generates a new `migrations/N_describe-your-change/` folder and
   applies it locally.
6. **Production deploys** use:
   ```bash
   npx prisma migrate deploy
   ```
   Which applies any pending migrations in order. Add this to the Render
   build/start command BEFORE `npm start`.
7. Update CLAUDE.md to remove the "НЕ запускать: prisma:migrate" note.

## Why not just keep `db push`?

`db push` does what you tell it without keeping a record. After your
first real user, that means:

- No rollback path if a column rename loses data.
- No way to see what changed when, or who applied it.
- Render deploys silently push whatever's in the schema file at deploy
  time — no review gate.
- Multi-environment drift (staging vs prod) becomes invisible.

Migrations cost ~30 seconds per schema change (generate + commit) and
give you an audit trail forever.

## What this commit does NOT do

- Does NOT touch the Neon database.
- Does NOT mark anything as applied.
- Does NOT change the `package.json` scripts.
- Does NOT change CLAUDE.md.

When you decide to switch over, follow the recipe above. Until then,
keep using `db push` — these files just wait.
