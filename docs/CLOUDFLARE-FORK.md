# Deploying this repo to another Cloudflare account

A runbook for a second lab (or anyone else) that wants its own copy on its own
Cloudflare account. It assumes the person operating it is comfortable with the
web dashboard, **not** with git or `npx`. Path A needs no terminal at all.

Nothing per-deployment is committed: the Worker's URL, the auth secret and the
D1 database id are all values in *their* account, set as Cloudflare build/runtime
secrets. No file in the fork ever changes, so **Sync fork** never conflicts.

## What changes per account

| Thing | Where | Per account? |
|---|---|---|
| `D1_DATABASE_ID` | Build secret (build-time) | **Yes** (no file) |
| `BETTER_AUTH_URL` | Worker secret | Yes (no file) |
| `BETTER_AUTH_SECRET` | Worker + build secret | Yes (no file) |
| `SEED_ADMIN_PASSWORD` | Build secret (only if seeding from Builds) | Yes (no file) |
| Worker name `lab-inventory` | `wrangler.jsonc` | No — names are per account |
| `LOG_RESET_LINKS=0` | `wrangler.jsonc` `vars` | No — leave it there |

`.env` is for Docker/Node only; the Worker never reads it.

## Path A — dashboard only (no git, no terminal)

### 1. Own copy of the code

Open the upstream repo on github.com → **Fork** → create it under their account.
A fork is a copy they control; Cloudflare cannot deploy from a repository the
person does not own, so this step is required. No git commands, and later they
can pull upstream changes with the **Sync fork** button.

### 2. Their database

Cloudflare dashboard → **Storage & Databases → D1 → Create database**, name it
`lab-inventory` (the npm scripts hardcode that name). Copy the **Database ID** —
it is entered as a build variable in step 5, not committed to the fork.
Editing `wrangler.jsonc` in the fork also works, but then every upstream change
to that file turns **Sync fork** into a merge.

### 3. Worker from the repo

Dashboard → **Workers & Pages → Create → Import a Git repository** → pick the
fork. Settings:

- **Build command:** `npm run build`
- **Deploy command:** `npm run deploy:worker:init` (first deploy only — see step 5)

### 4. Token that may touch D1

Builds creates an API token automatically, but it cannot edit D1, so the migration
step fails with a permission error. Fix it once:

- My Profile → **API Tokens → Create Token → Custom token**, permissions:
  **Account → D1: Edit**, **Workers Scripts: Edit**, **Account Settings: Read**
  (add **Zone → Workers Routes: Edit** only for a custom domain).
- Worker → **Settings → Build → API token** → select that token.

### 5. Build variables and secrets

Worker → **Settings → Build → Build variables and secrets** (build-time only):

- `D1_DATABASE_ID` — the id copied in step 2 (type **Secret**, or a plain build
  variable; it is not a credential). Every `*:d1` and `deploy:worker*` script
  reads it through `scripts/wrangler.ts`, which generates the config with that
  binding, so the committed `wrangler.jsonc` keeps the placeholder.
- `SEED_ADMIN_PASSWORD` — the admin password this lab will start with (type **Secret**)
- `BETTER_AUTH_SECRET` — any long random string (type **Secret**)

`deploy:worker:init` applies the schema, seeds permissions/categories/sample
items/the admin account, then uploads the Worker. Because the seed password is
supplied, it is not printed into the build log.

After that first green build, change the **Deploy command** to
`npm run deploy:worker:ci` so later pushes only migrate (idempotent) and deploy —
re-seeding every build is pointless and would keep logging admin state.

### 6. Runtime secrets

Worker → **Settings → Variables and Secrets** — these are visible to the running
Worker, unlike build variables, and must be type **Secret**:

- `BETTER_AUTH_URL` — the exact public URL, `https://lab-inventory.<subdomain>.workers.dev`
  (or the custom domain). Until it is set the Worker answers `500` and names it.
- `BETTER_AUTH_SECRET` — the same value as in step 5.

Changing a secret publishes a new version immediately; no rebuild needed.

### 7. First login

Open `https://<url>/api/health` (expect `{"status":"ok"}`), then sign in as
`admin@lab.edu` (or `admin`) with the password from step 5 and change it in
Settings. There is no mailer and `LOG_RESET_LINKS` is pinned to `0`, so a
forgotten password is reset in the D1 console or by re-running the seed.

### 8. Optional custom domain

Worker → **Settings → Domains & Routes → Add custom domain**, then set
`BETTER_AUTH_URL` to that domain. Keeping both hostnames alive? Add the other one
to `TRUSTED_ORIGINS` (comma-separated) or logins fail with `403 INVALID_ORIGIN`.

Preview builds also use the primary D1 binding, i.e. the production database.
Leave previews disabled unless writing to it from pull requests is intended.

## Path B — one terminal, five commands

Someone with Node 22+ and this checkout can do the same against their account
(`npx wrangler login`, or `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`):

```bash
npx --yes wrangler@4.160.0 d1 create lab-inventory   # copy the printed id
export D1_DATABASE_ID=<that-id>                      # or edit wrangler.jsonc
npm run deploy:worker:init                           # migrate + seed + deploy
npx --yes wrangler@4.160.0 secret put BETTER_AUTH_URL    # https://…
npx --yes wrangler@4.160.0 secret put BETTER_AUTH_SECRET # openssl rand -base64 32
npm run deploy:worker                                # build + deploy again
```

`SEED_ADMIN_PASSWORD='…'` in front of the second line picks the admin password;
without it the seed generates one and prints it.

## Gotchas

- **The placeholder id deploys fine and binds nothing.** A fresh account must set
  `D1_DATABASE_ID` (or edit `database_id`) or every query fails at runtime.
- **Updates are pull, not push.** Upstream cannot push into a fork: the owner
  clicks **Sync fork** (or wires a sync workflow), and Cloudflare Builds deploys
  `main` again on the resulting push. Because the fork edits no files, that sync
  is always a fast-forward.
- **Deploy before the schema exists?** The Worker answers `500` telling you to run
  the migration; `deploy:worker:init`/`:ci` already handle the order.
- **A failing migration stops the deploy.** That is deliberate: no half-migrated
  schema gets published. Empty the deploy command temporarily to ship anyway.
- **`wrangler` is not a dependency** (it needs Node ≥ 22 while the app ships on
  Node 20), so every script names `wrangler@4.160.0`. Keep the version in step
  with CI when bumping it.
- **Backups** are D1 Time Travel (30 days). The in-process `./backups` scheduler
  is Docker-only, and `labs.json` / the admin UI's "create lab" are Docker-only
  too — extra labs on Workers come from `LAB_DATABASES` (remote `libsql://`).
- **Free plan is enough** for one lab: Workers + D1, 3,000 build-minutes/month.
