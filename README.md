# LabStock — Lab Inventory Management System

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
