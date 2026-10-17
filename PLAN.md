# Lab Inventory Management System — PLAN.md

## Overview

A self-hosted inventory management dashboard for a Chemistry/Physics research laboratory. Lab mates log in to check out equipment, log chemical/consumable usage, and track inventory levels. The system runs as a Docker container on a home/lab server, exposed via Cloudflare Tunnel at `labs.example.com`.

---

## Requirements Summary

| Aspect | Decision |
|--------|----------|
| **Scale** | Small lab — < 10 users, < 500 items |
| **Equipment tracking** | Check-out / Return flow with expected return dates |
| **Chemical tracking** | Full safety: CAS number, hazard class, expiry date, storage conditions, SDS links |
| **Consumables** | Simple quantity logging with usage history |
| **Roles** | Admin / Senior / Junior (multi-role) |
| **Delete behavior** | Hard delete + full audit log |
| **Notifications** | In-app (low stock, expiring chemicals, overdue equipment) |
| **UI** | Mobile-responsive web |
| **Auth** | Better Auth (email + password credentials) |
| **Deployment** | Docker on home/lab server + Cloudflare Tunnel |
| **Backups** | Daily automated database backups |
| **Data** | Starting fresh (no migration needed) |

---

## Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Frontend** | Vite + React 18 + TypeScript | Fast SPA, instant HMR, modern tooling |
| **Backend** | Hono (Node.js) | Lightweight, fast, excellent TypeScript, works with any DB |
| **Database** | Turso (libSQL) | SQLite-compatible, single-file, runs anywhere, free tier available |
| **ORM** | Drizzle ORM | Type-safe, lightweight, native libSQL adapter, works with Turso |
| **Auth** | Better Auth | Modern auth framework, Drizzle adapter, credentials provider, React integration |
| **UI** | Tailwind CSS + shadcn/ui | Clean dashboard components, tables, forms, dialogs, mobile-responsive |
| **Validation** | Zod | Schema validation for all API inputs |
| **State/Data** | TanStack Query | Caching, optimistic updates for quantity changes |
| **Containerization** | Docker + Docker Compose | Single container: Hono serves API + static frontend files |
| **Reverse Proxy** | Cloudflare Tunnel | Exposes local server without opening ports, provides HTTPS |
| **Backups** | Turso dump / SQLite .db copy + cron | Daily automated backups to mounted volume |

---

## Architecture Decision: Why Vite + Hono + Turso

**Why not Next.js?**
- Next.js is a full-stack framework with API routes, SSR, and file-based routing — powerful but heavy for a simple CRUD dashboard
- Vite gives us a fast, lightweight SPA with instant HMR during development
- Separating frontend and backend is cleaner for this use case — the backend is a pure API, the frontend is a pure SPA

**Why Hono over Express?**
- Hono is 3x faster, smaller, and has first-class TypeScript support
- Built-in middleware pattern that's cleaner than Express middleware
- Works seamlessly with Better Auth's Node handler
- Smaller bundle, fewer dependencies

**Why Turso over PostgreSQL?**
- Turso is SQLite-compatible — zero configuration, single file, no separate server process
- For a small lab (< 10 users, < 500 items), SQLite is more than sufficient
- Built-in backups (copy the file), point-in-time recovery
- Turso adds replication and edge features if needed later
- Drizzle ORM has a native `drizzle-orm/libsql` adapter

**Why Better Auth over NextAuth.js?**
- Better Auth is framework-agnostic — works with any backend (Hono, Express, etc.)
- Native Drizzle ORM adapter — no separate Prisma schema needed
- Built-in React hooks and components
- Credentials provider out of the box
- Active maintenance, modern API

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                          │
│              labs.example.com                      │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│              Cloudflare Tunnel                       │
│         (cloudflared on lab server)                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Docker Container (lab server)            │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │         Hono Server (Node.js)                │     │
│  │                                              │     │
│  │  ┌─────────────┐  ┌──────────────────────┐  │     │
│  │  │ Static Files │  │ API Routes           │  │     │
│  │  │ (Vite build) │  │ /api/items           │  │     │
│  │  │              │  │ /api/equipment        │  │     │
│  │  │              │  │ /api/usage           │  │     │
│  │  │              │  │ /api/auth/*          │  │     │
│  │  │              │  │ /api/notifications   │  │     │
│  │  │              │  │ /api/audit           │  │     │
│  │  │              │  │ /api/users           │  │     │
│  │  └─────────────┘  └──────────┬───────────┘  │     │
│  │                             │               │     │
│  │  ┌──────────────────────────▼───────────┐   │     │
│  │  │        Better Auth                   │   │     │
│  │  │   (credentials provider, Drizzle)    │   │     │
│  │  └──────────────────────────┬───────────┘   │     │
│  │                             │               │     │
│  │  ┌──────────────────────────▼───────────┐   │     │
│  │  │        Drizzle ORM                   │   │     │
│  │  │   (drizzle-orm/libsql adapter)       │   │     │
│  │  └──────────────────────────┬───────────┘   │     │
│  └─────────────────────────────┼───────────────┘     │
│                                │                      │
│  ┌─────────────────────────────▼───────────────┐     │
│  │        Turso Database (libSQL)              │     │
│  │   (local file: /data/lab.db)                 │     │
│  │   (daily backups: /backups/)                 │     │
│  └──────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## Data Model

### Users
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| name | TEXT | Full name |
| email | TEXT (unique) | Login identifier |
| passwordHash | TEXT | Bcrypt hashed |
| role | TEXT | `ADMIN`, `SENIOR`, `JUNIOR` |
| createdAt | TEXT | ISO 8601 datetime |
| updatedAt | TEXT | ISO 8601 datetime |

### Categories
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| name | TEXT | Equipment, Chemicals, Consumables |
| description | TEXT | |
| createdAt | TEXT | ISO 8601 datetime |

### Items (base inventory table)
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| name | TEXT | Item name |
| categoryId | TEXT (FK) | → Categories |
| description | TEXT | |
| location | TEXT | Storage location in lab |
| quantity | REAL | Current stock level |
| unit | TEXT | g, mL, L, pieces, boxes, etc. |
| minStockThreshold | REAL | Low-stock alert threshold |
| imageUrl | TEXT | Optional item photo |
| createdAt | TEXT | ISO 8601 datetime |
| updatedAt | TEXT | ISO 8601 datetime |

### ChemicalDetails (extends Items)
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| itemId | TEXT (FK, unique) | One-to-one with Items |
| casNumber | TEXT | CAS Registry Number |
| hazardClass | TEXT | GHS hazard classification |
| hazardPictograms | TEXT (JSON) | Array of GHS pictogram codes |
| expiryDate | TEXT | ISO 8601 date |
| storageConditions | TEXT | e.g., "4°C", "flammable cabinet" |
| sdsUrl | TEXT | Link to Safety Data Sheet |
| molecularFormula | TEXT | |

### EquipmentDetails (extends Items)
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| itemId | TEXT (FK, unique) | One-to-one with Items |
| serialNumber | TEXT | |
| status | TEXT | `AVAILABLE`, `CHECKED_OUT`, `MAINTENANCE` |
| condition | TEXT | Notes on physical condition |
| purchaseDate | TEXT | ISO 8601 date |
| warrantyExpiry | TEXT | ISO 8601 date |

### EquipmentCheckouts
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| itemId | TEXT (FK) | → Items |
| userId | TEXT (FK) | → Users |
| checkedOutAt | TEXT | ISO 8601 datetime |
| expectedReturnAt | TEXT | ISO 8601 datetime |
| returnedAt | TEXT | ISO 8601 datetime, null = still out |
| notes | TEXT | |
| status | TEXT | `ACTIVE`, `RETURNED`, `OVERDUE` |

### UsageLogs (consumables & chemicals)
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| itemId | TEXT (FK) | → Items |
| userId | TEXT (FK) | → Users |
| quantityUsed | REAL | Amount consumed |
| usedAt | TEXT | ISO 8601 datetime |
| notes | TEXT | Experiment/project reference |
| createdAt | TEXT | ISO 8601 datetime |

### AuditLogs
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| userId | TEXT (FK) | → Users |
| action | TEXT | `CREATE`, `UPDATE`, `DELETE`, `CHECKOUT`, `RETURN`, `LOGIN`, `IMPORT` |
| entityType | TEXT | `Item`, `Chemical`, `Equipment`, `User`, `Checkout` |
| entityId | TEXT | ID of affected entity |
| details | TEXT (JSON) | Before/after values or action metadata |
| ipAddress | TEXT | |
| timestamp | TEXT | ISO 8601 datetime |

### Notifications
| Field | Type | Notes |
|-------|------|-------|
| id | TEXT (PK) | UUID |
| userId | TEXT (FK) | → Users, null = broadcast to all |
| type | TEXT | `LOW_STOCK`, `EXPIRY_WARNING`, `OVERDUE_EQUIPMENT` |
| title | TEXT | |
| message | TEXT | |
| read | INTEGER | 0 or 1 (SQLite boolean) |
| link | TEXT | Deep link to relevant item |
| createdAt | TEXT | ISO 8601 datetime |

---

## Role Permissions

| Action | Admin | Senior | Junior |
|--------|-------|--------|--------|
| View inventory | ✅ | ✅ | ✅ |
| Add new items | ✅ | ✅ | ❌ |
| Edit items | ✅ | ✅ | ❌ |
| Delete items | ✅ | ✅ | ❌ |
| Log usage (consumables/chemicals) | ✅ | ✅ | ✅ |
| Check out equipment | ✅ | ✅ | ✅ |
| Return equipment | ✅ | ✅ | ✅ |
| View audit log | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Manage categories | ✅ | ❌ | ❌ |
| Export data | ✅ | ✅ | ❌ |

---

## API Endpoints

### Auth (Better Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/sign-up/email` | Self sign-up (creates app profile as JUNIOR via hook) |
| POST | `/api/auth/sign-in/email` | Email/password login |
| POST | `/api/auth/sign-out` | Logout |
| GET | `/api/auth/get-session` | Get current session |

> Better Auth mounts under `/api/auth/*` in Hono via `app.use` (not `app.on` — see note in `src/server/index.ts`). The app-level `users` table (roles) is linked to Better Auth's `user` table by email; every sign-up auto-creates a JUNIOR profile row, admins promote via `PUT /api/users/:id/role`.

### Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/items` | List all items (with filters, search, pagination) |
| GET | `/api/items/:id` | Get single item with details |
| POST | `/api/items` | Create new item (Admin/Senior) |
| PUT | `/api/items/:id` | Update item (Admin/Senior) |
| DELETE | `/api/items/:id` | Delete item (Admin/Senior, hard delete + audit) |

### Equipment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/equipment/:id/checkout` | Check out equipment |
| POST | `/api/equipment/:id/return` | Return equipment |
| GET | `/api/equipment/:id/history` | Checkout history for item |

### Usage
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/usage` | Log usage of consumable/chemical |
| GET | `/api/usage` | Usage logs (filterable by item, user, date) |
| GET | `/api/usage/:id` | Single usage log entry |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get user's notifications |
| PUT | `/api/notifications/:id/read` | Mark as read |
| PUT | `/api/notifications/read-all` | Mark all as read |

### Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit` | View audit log (Admin only) |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category (Admin) |
| PUT | `/api/categories/:id` | Update category (Admin) |
| DELETE | `/api/categories/:id` | Delete category (Admin) |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users (Admin) |
| PUT | `/api/users/:id/role` | Change user role (Admin) |
| DELETE | `/api/users/:id` | Delete user (Admin) |

---

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Email/password login form |
| Dashboard | `/` | Overview: total items, low stock alerts, recent activity, overdue equipment |
| Inventory | `/inventory` | Full inventory list with search, filter by category, sort |
| Item Detail | `/inventory/:id` | Item details, edit form, usage/checkout history, delete |
| Add Item | `/inventory/new` | Form to add new item (category-specific fields) |
| Equipment | `/equipment` | Equipment list with check-out/return actions |
| Usage Log | `/usage` | Log new usage, view usage history |
| Notifications | `/notifications` | In-app notification center |
| Audit Log | `/audit` | Full audit trail (Admin only) |
| User Management | `/users` | Manage users and roles (Admin only) |
| Settings | `/settings` | User profile, password change |

---

## Key Features

### 1. Equipment Check-out / Return Flow
- User selects equipment → clicks "Check out" → sets expected return date → confirms
- System updates item status to `CHECKED_OUT`, creates checkout record, logs audit entry
- On return: user clicks "Return" → system updates status to `AVAILABLE`, sets `returnedAt`
- Overdue equipment highlighted on dashboard and in notifications

### 2. Chemical Safety Tracking
- CAS number, GHS hazard class, pictograms, expiry date, storage conditions
- SDS document link (can link to external URL or uploaded file)
- Expiry warnings: notifications when chemicals expire within 30/60/90 days
- Hazard pictograms displayed on item cards and detail pages

### 3. Automatic Quantity Updates
- When usage is logged, item quantity automatically decremented
- Optimistic UI update (TanStack Query) for instant feedback
- Low stock notification triggered when quantity falls below threshold

### 4. Audit Log
- Every create, update, delete, checkout, return action logged
- Records: who, what, when, before/after values
- Admin-only access to full audit trail
- Hard deletes are permanent but fully traceable

### 5. In-App Notifications
- Low stock alerts (quantity < threshold)
- Chemical expiry warnings (configurable: 30/60/90 days before)
- Overdue equipment reminders
- Notification bell with unread count, mark-as-read, deep links

### 6. Mobile-Responsive Design
- Fully responsive layout using Tailwind CSS
- Touch-friendly buttons and forms
- Bottom navigation on mobile, sidebar on desktop
- Works on phones, tablets, and desktops

---

## Docker Compose Setup

```yaml
# docker-compose.yml
version: "3.9"

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:/data/lab.db
      - BETTER_AUTH_URL=https://labs.example.com
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
    volumes:
      - ./data:/data
      - ./backups:/backups
    restart: unless-stopped

  backup:
    image: alpine:latest
    volumes:
      - ./data:/data
      - ./backups:/backups
    command: >
      sh -c "apk add --no-cache sqlite &&
             echo '0 2 * * * sqlite3 /data/lab.db \".backup /backups/backup_$$(date +\%Y\%m\%d_\%H\%M\%S).db\"' | crontab - && cron -f"
    restart: unless-stopped
```

---

## Project Structure

```
labs/
├── docker-compose.yml
├── Dockerfile
├── .env
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── src/
│   ├── server/
│   │   ├── index.ts                    # Hono app entry point
│   │   ├── db/
│   │   │   ├── schema.ts               # Drizzle schema (all tables)
│   │   │   ├── index.ts                # DB client (libSQL/Turso)
│   │   │   └── migrate.ts              # Migration runner
│   │   ├── auth.ts                     # Better Auth config
│   │   ├── routes/
│   │   │   ├── items.ts                # CRUD for items
│   │   │   ├── equipment.ts            # Check-out/return
│   │   │   ├── usage.ts                # Usage logging
│   │   │   ├── notifications.ts        # Notification endpoints
│   │   │   ├── audit.ts                # Audit log endpoints
│   │   │   ├── categories.ts           # Category management
│   │   │   └── users.ts                # User management
│   │   ├── lib/
│   │   │   ├── permissions.ts          # Role-based permission helpers
│   │   │   ├── audit.ts                # Audit log helper
│   │   │   ├── notifications.ts        # Notification creation helpers
│   │   │   └── utils.ts                # Utility functions
│   │   └── middleware/
│   │       ├── auth.ts                 # Auth middleware (verify session)
│   │       └── rbac.ts                 # Role-based access control
│   ├── client/
│   │   ├── main.tsx                    # React entry point
│   │   ├── App.tsx                     # Router setup
│   │   ├── api/
│   │   │   └── client.ts                 # API fetch wrapper (TanStack Query)
│   │   ├── components/
│   │   │   ├── ui/                     # shadcn/ui components
│   │   │   ├── layout/
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── header.tsx
│   │   │   │   └── mobile-nav.tsx
│   │   │   ├── inventory/
│   │   │   │   ├── item-card.tsx
│   │   │   │   ├── item-form.tsx
│   │   │   │   ├── item-table.tsx
│   │   │   │   └── chemical-details-form.tsx
│   │   │   ├── equipment/
│   │   │   │   ├── checkout-dialog.tsx
│   │   │   │   ├── return-dialog.tsx
│   │   │   │   └── equipment-card.tsx
│   │   │   ├── usage/
│   │   │   │   ├── usage-form.tsx
│   │   │   │   └── usage-table.tsx
│   │   │   └── notifications/
│   │   │       ├── notification-bell.tsx
│   │   │       └── notification-list.tsx
│   │   ├── hooks/
│   │   │   ├── use-items.ts
│   │   │   ├── use-equipment.ts
│   │   │   ├── use-usage.ts
│   │   │   └── use-notifications.ts
│   │   ├── pages/
│   │   │   ├── login.tsx
│   │   │   ├── dashboard.tsx
│   │   │   ├── inventory.tsx
│   │   │   ├── item-detail.tsx
│   │   │   ├── add-item.tsx
│   │   │   ├── equipment.tsx
│   │   │   ├── usage.tsx
│   │   │   ├── notifications.tsx
│   │   │   ├── audit.tsx
│   │   │   ├── users.tsx
│   │   │   └── settings.tsx
│   │   └── lib/
│   │       ├── auth.ts                 # Better Auth client
│   │       └── utils.ts                # Utility functions
│   └── shared/
│       └── types.ts                    # Shared TypeScript types
├── public/
│   └── uploads/                        # SDS documents, item images
├── data/                               # Turso database file (git-ignored)
├── backups/                            # Database backup files (git-ignored)
└── scripts/
    └── seed.ts                         # Seed data script
```

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
- [ ] Initialize Vite + React + TypeScript project
- [ ] Set up Tailwind CSS + shadcn/ui
- [ ] Set up Hono backend with TypeScript
- [ ] Configure Drizzle ORM with Turso (libSQL)
- [ ] Define Drizzle schema (all tables)
- [ ] Run initial migration
- [ ] Set up Better Auth with credentials provider + Drizzle adapter
- [ ] Create login page and auth flow
- [ ] Build basic layout (sidebar, header, mobile nav)
- [ ] Dockerize the application

### Phase 2: Core Inventory (Days 3-4)
- [ ] Inventory list page with search, filter, sort
- [ ] Add item form (category-specific fields)
- [ ] Item detail page with edit capability
- [ ] Delete item with audit logging
- [ ] Category management (Admin)
- [ ] Role-based permission enforcement

### Phase 3: Equipment Check-out / Return (Day 5)
- [ ] Equipment list page
- [ ] Check-out dialog with expected return date
- [ ] Return action
- [ ] Checkout history per item
- [ ] Overdue equipment highlighting

### Phase 4: Usage Logging & Quantity (Day 6)
- [ ] Usage log form (consumables & chemicals)
- [ ] Automatic quantity decrement on usage
- [ ] Usage history page with filters
- [ ] Low stock detection and notifications

### Phase 5: Chemical Safety (Day 7)
- [ ] Chemical details form (CAS, hazard, expiry, storage, SDS)
- [ ] Hazard pictogram display
- [ ] Expiry warning notifications
- [ ] Chemical-specific item detail view

### Phase 6: Notifications & Audit (Day 8)
- [ ] Notification bell with unread count
- [ ] Notification center page
- [ ] Automated notification generation (via API hooks / cron)
- [ ] Full audit log page (Admin)
- [ ] Audit logging on all mutations

### Phase 7: Polish & Deploy (Days 9-10)
- [ ] Mobile responsiveness testing and fixes
- [ ] User management page (Admin)
- [ ] Settings page (profile, password change)
- [ ] Seed data for testing
- [ ] Production build optimization
- [ ] Cloudflare Tunnel setup
- [ ] Go-live at labs.example.com

---

## Environment Variables

```env
# .env
DATABASE_URL=file:/data/lab.db
BETTER_AUTH_URL=https://labs.example.com
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-32>
```

---

## Security Considerations

- Passwords hashed with bcrypt (via Better Auth)
- Role-based access control on every API route (Hono middleware)
- CSRF protection (built into Better Auth)
- Input validation with Zod on all API endpoints
- SQL injection prevention via Drizzle ORM parameterized queries
- HTTPS via Cloudflare Tunnel
- No sensitive data exposed in client-side code
- Audit log for accountability
- Session management with secure, httpOnly cookies

---

## Backup Strategy

- **Daily automated backups** via SQLite `.backup` command in a cron job inside the backup container
- Backups stored in `./backups/` directory on the host machine
- Backup filename format: `backup_YYYYMMDD_HHMMSS.db`
- Retention: manually prune old backups (or add a cleanup cron job)
- Restore: `sqlite3 lab.db < backup_file.db` or simply replace the file

---

## Future Enhancements (Out of Scope for v1)

- QR code generation and scanning for items
- Barcode scanner integration
- Email notifications (in addition to in-app)
- Multi-lab support (if the system grows)
- API for external integrations (e.g., procurement system)
- Data export to CSV/Excel
- Supplier tracking and reorder management
- Equipment maintenance scheduling
- Chemical waste tracking
