# Labs — Lab Inventory Management System

A self-hosted inventory management dashboard for a Chemistry/Physics research laboratory. Lab mates log in to check out equipment, log chemical/consumable usage, and track inventory levels. Runs as a Docker container on a home/lab server, exposed via Cloudflare Tunnel.

## Features

- **Inventory management** — Items with categories, quantities, units, locations, and low-stock thresholds
- **Chemical safety tracking** — CAS number, GHS hazard class, pictograms, expiry date, storage conditions, SDS links
- **Equipment check-out / return** — With expected return dates, status tracking, and overdue highlighting
- **Usage logging** — Consumable/chemical usage with automatic quantity decrement and low-stock alerts
- **Role-based access control** — Admin, Supervisor, PostDoc, PhD, Project Research Fellow, Others with granular permissions (Admin/Supervisor define who can do what)
- **In-app notifications** — Low stock, expiring chemicals, overdue equipment
- **Audit log** — Full create/update/delete/checkout/return trail (Admin-only)
- **Data export** — CSV export for items, usage, checkouts, audit log, and users
- **Password reset** — Forgot password / reset password flow (reset link logged to server console in self-hosted mode)
- **Software name customization** — Admin/Supervisor can set the lab/software name shown in the sidebar
- **Mobile-responsive** — Tailwind CSS + shadcn/ui, sidebar on desktop, bottom nav on mobile
- **Docker + Cloudflare Tunnel** — Single-container deployment with daily SQLite backups

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React 18 + TypeScript, TanStack Query, React Router |
| Backend | Hono (Node.js) |
| Database | Turso (libSQL) via Drizzle ORM |
| Auth | Better Auth (email + password credentials) |
| UI | Tailwind CSS + shadcn/ui |
| Validation | Zod |
| Containerization | Docker + Docker Compose |
| Reverse Proxy | Cloudflare Tunnel |

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values (DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET)

# Generate and run database migrations
npm run db:generate
npm run db:migrate
npm run db:seed

# Start dev servers (client :5173 + API :3000)
npm run dev
```

Seed credentials: `admin@lab.edu / admin123`

### Production (Docker)

```bash
# Set BETTER_AUTH_SECRET and BETTER_AUTH_URL
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export BETTER_AUTH_URL=https://labs.yourdomain.com

docker-compose up -d
```

The app runs on port 3000. Expose it via Cloudflare Tunnel pointing to `http://localhost:3000`.

### Labs: create and manage them from the UI

Open **Administration → Labs** (Admin only) to see every lab in the instance and create new ones with the **New lab** form — no restart, no config files. Each lab is a fully separate database file (own users, inventory, audit log, settings) stored next to the main database (`labs.json` registry + one `.db` file per lab).

- Your Admin account is copied into the new lab automatically — sign in there with the same password.
- After creating, press **Switch** (or log out): pick the new lab on the login page and sign in.
- The login-page lab selector lists every lab, including ones created here.
- New labs start with default categories, permissions and the lab name as software name — no sample items.
- Permission `labs:manage` (Admins have it; it can be delegated via the Permissions page).

Env-var labs (`LAB2_DATABASE_URL` / `LAB_DATABASES`) keep working exactly as before and appear in the same list.

### Two separate labs in one instance via config (optional)

One deployment can serve **two fully separate labs** (e.g. Photonics + Quantum), each with its own isolated database file — own users, inventory, equipment, audit log and settings. Nothing inside the app changes; a lab selector appears at the bottom of the login page only when a second lab is configured, otherwise it stays hidden.

```bash
# .env
DATABASE_URL=file:./data/lab1.db
LAB2_DATABASE_URL=file:./data/lab2.db
LAB1_NAME=Photonics Lab
LAB2_NAME=Quantum Lab

npm run db:migrate                 # migrates both database files
npm run db:seed                    # seeds lab 1 (admin@lab.edu / admin123)
SEED_LAB=lab-2 npm run db:seed     # seeds lab 2 (same admin credentials)
```

The Admin/Supervisor reuses the same email + password in both labs and picks the lab on the login page. Users, inventory and history never cross between labs. Switching labs after login = log out, pick the other lab, log in. Daily backups cover both `*.db` files automatically.

### Usernames (email or username login)

Every account can have a **username** in addition to its email. The login page accepts either — type your email or your username plus the same password. Usernames are lowercase, 3–30 characters, letters/numbers/dots/underscores, and unique per lab.

- **Users** set/change their own username in **Settings → Username** (existing accounts keep working with email until they set one).
- **Admin/Supervisor** can assign one when creating an account in **Users → Create User** (auto-suggested from the email, editable), and see everyone's username in the users table.
- After `npm run db:migrate`, the seeded admin gets username `admin` automatically (login: `admin` / `admin@lab.edu`, password `admin123`).

### Changing your name and email (Settings → Profile)

Any user, including the Lab Admin, can update their own **name** and **email** from Settings → Profile — no need to touch the database. Name changes save directly; email changes ask for the current password first and must be unique. You stay signed in (sessions are tied to the account, not the address), other devices are signed out on an email change, and the change is recorded in the audit log.

### Database Backups

The `docker-compose.yml` includes a `backup` service that runs a daily SQLite `.backup` cron job to `./backups/`.

## Project Structure

```
labs/
├── src/
│   ├── server/           # Hono backend
│   │   ├── db/           # Drizzle schema, client, migrations
│   │   ├── auth.ts       # Better Auth config
│   │   ├── routes/       # API routes (items, equipment, usage, etc.)
│   │   ├── middleware/   # Auth + permission guards
│   │   └── lib/          # Audit, permissions, settings helpers
│   ├── client/           # React frontend
│   │   ├── pages/        # Route pages
│   │   ├── components/   # shadcn/ui + custom components
│   │   ├── hooks/        # TanStack Query hooks
│   │   └── lib/          # API client, auth client, helpers
│   └── shared/           # Shared TypeScript types
├── scripts/
│   ├── seed.ts           # Database seeding
│   └── generate-notifications.ts  # Scheduled notification cron
├── drizzle/              # SQL migrations
├── public/uploads/       # SDS documents, item images
├── data/                 # SQLite database file (git-ignored)
├── backups/              # DB backups (git-ignored)
├── docker-compose.yml
├── Dockerfile
└── PLAN.md               # Original project plan
```

## Roles & Permissions

Six roles with Admin/Supervisor-definable permissions:

| Role | Typical Permissions |
|------|-------------------|
| Admin | Full access (all permissions) |
| Supervisor | Most inventory + settings management |
| PostDoc | Create/edit items, check out/return equipment, log usage |
| PhD | Create items, check out/return equipment, log usage |
| Project Research Fellow | View inventory, check out/return equipment, log usage |
| Others | View inventory, view notifications |

Admin manages permissions via the **Permissions** page. User accounts are created by Admin/Supervisor via the **Users** page (public sign-up is disabled).

## License

MIT
