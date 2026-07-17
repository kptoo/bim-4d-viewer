# 4D BIM Viewer — Deployment Guide

**Version:** 3.0.0  
**Target:** Vercel (frontend) + Neon (PostgreSQL database)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Required Environment Variables](#2-required-environment-variables)
3. [Local Development Setup](#3-local-development-setup)
4. [Neon Database Setup](#4-neon-database-setup)
5. [Running Database Migrations](#5-running-database-migrations)
6. [Vercel Deployment](#6-vercel-deployment)
7. [Build Commands](#7-build-commands)
8. [Post-Deployment Verification](#8-post-deployment-verification)
9. [Troubleshooting](#9-troubleshooting)
10. [Known Limitations](#10-known-limitations)

---

## 1. Prerequisites

| Software     | Minimum Version | Purpose                     |
|--------------|-----------------|-----------------------------|
| Node.js      | 18.x or later   | Build tool runtime          |
| npm          | 9.x or later    | Package management          |
| Git          | Any             | Version control             |
| Neon account | Free tier or +  | PostgreSQL database         |
| Vercel account | Free tier +   | Production hosting          |

---

## 2. Required Environment Variables

The application requires one environment variable:

```
VITE_NEON_DATABASE_URL=postgres://user:password@host/database?sslmode=require
```

This is the Neon database connection string. It is used **in the browser** via the `@neondatabase/serverless` HTTP driver, which connects to Neon over HTTPS without a traditional server-side proxy.

> **Security note:** This connection string is visible in the compiled JavaScript bundle. For a public-facing deployment, use Neon's IP allowlist and a read-limited role, or add a backend API proxy layer.

---

## 3. Local Development Setup

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Create the environment file

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_NEON_DATABASE_URL=postgres://user:password@ep-XXXXX.region.neon.tech/neondb?sslmode=require
```

### Step 3: Run the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Step 4: Verify the database connection

The application will show an error state in the Activities and Zones panels if the database connection is not configured. Verify by:

1. Opening the Zones tab in the right panel.
2. If layers load (even an empty list), the connection is healthy.
3. If an error is shown, check the browser console for the connection error.

---

## 4. Neon Database Setup

### Step 1: Create a Neon project

1. Go to [neon.tech](https://neon.tech) and sign in.
2. Click **New project**.
3. Choose a region close to your users.
4. Note the connection string from the project dashboard.

### Step 2: Copy the connection string

From the Neon dashboard:
1. Open your project.
2. Click **Connection Details**.
3. Select the `main` branch and `neondb` database.
4. Copy the **Connection string** (postgres://...).

### Step 3: Configure the environment variable

In `.env.local` (local) or Vercel environment settings (production):

```env
VITE_NEON_DATABASE_URL=postgres://user:password@ep-XXXXX.eu-west-2.aws.neon.tech/neondb?sslmode=require
```

---

## 5. Running Database Migrations

Migrations must be run once when setting up a new database or when new migrations are added.

### Option A: Neon SQL Editor (recommended for first-time setup)

1. Open the Neon dashboard → SQL Editor.
2. Paste and run `migrations/001_create_layers.sql`.
3. Paste and run `migrations/002_create_activities.sql`.

### Option B: psql CLI

```bash
psql "$VITE_NEON_DATABASE_URL" -f migrations/001_create_layers.sql
psql "$VITE_NEON_DATABASE_URL" -f migrations/002_create_activities.sql
```

### Option C: Via the application

The application uses `CREATE TABLE IF NOT EXISTS` in all migrations, so re-running them is safe. New migrations should always be additive and idempotent.

### Migration order

Migrations must be run in numerical order:

```
001_create_layers.sql      — Run first (information_layers + layer_assignments)
002_create_activities.sql  — Run second (activities + activity_object_links)
```

---

## 6. Vercel Deployment

### Step 1: Connect repository to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New Project**.
3. Import your Git repository.
4. Vercel detects Vite automatically.

### Step 2: Configure environment variables

In the Vercel project settings → **Environment Variables**:

| Name                       | Value                                | Environments           |
|----------------------------|--------------------------------------|------------------------|
| `VITE_NEON_DATABASE_URL`   | Your Neon connection string          | Production, Preview    |

> In Vercel, VITE_ prefixed variables are automatically exposed to the browser build.

### Step 3: Configure build settings (usually auto-detected)

| Setting        | Value          |
|----------------|----------------|
| Framework      | Vite           |
| Build Command  | `npm run build` |
| Output Dir     | `dist`         |
| Install Command| `npm install`  |
| Node.js Version| 18.x           |

### Step 4: Deploy

Click **Deploy**. Vercel will:
1. Install dependencies.
2. Run `tsc && vite build`.
3. Output static files to `dist/`.
4. Deploy to a global CDN.

### Step 5: Configure CORS for Neon (if needed)

Neon's HTTP driver communicates via HTTPS to `*.neon.tech`. Ensure your deployment allows outbound HTTPS to Neon's domains. No additional CORS headers are required for Vercel.

---

## 7. Build Commands

```bash
# Development server (HMR enabled)
npm run dev

# Production build (TypeScript + Vite)
npm run build

# Preview the production build locally
npm run preview

# Run unit tests
npm run test
```

---

## 8. Post-Deployment Verification

After deployment, verify each feature works end-to-end:

### IFC Upload
- [ ] Drag and drop a `.ifc` file onto the upload zone.
- [ ] The 3D model renders in the viewer.
- [ ] Element count appears in the header.

### Selection
- [ ] Click a mesh in the viewer → Inspector shows properties.
- [ ] Click a Gantt bar → viewer highlights linked objects.
- [ ] Click empty space → selection clears.

### Activities
- [ ] Activities tab shows the list (or empty state).
- [ ] Creating a new activity persists after page reload.
- [ ] Editing and deleting work correctly.

### Information Layers
- [ ] Zones tab shows the layer list (or empty state).
- [ ] Creating a layer persists after page reload.
- [ ] Assigning elements to a layer and filtering works.

### Gantt
- [ ] Gantt chart renders with loaded activities.
- [ ] Clicking a bar selects the activity and highlights 3D objects.

### Database connectivity
- [ ] No "VITE_NEON_DATABASE_URL is not set" errors in console.
- [ ] Data persists across page reloads and browser sessions.

---

## 9. Troubleshooting

### "VITE_NEON_DATABASE_URL is not set"

**Cause:** The environment variable is missing from `.env.local` or Vercel.  
**Fix:** Add `VITE_NEON_DATABASE_URL=postgres://...` to your env file / Vercel settings.

### "Failed to load activities" / "Failed to load layers"

**Cause:** Database connectivity issue.  
**Fixes:**
1. Verify the connection string is correct and the Neon project is active.
2. Check the Neon dashboard — the database may be in sleep mode (cold start).
3. Open the browser dev tools → Network tab → look for failed requests to `neon.tech`.

### IFC file doesn't render

**Cause:** Invalid or unsupported IFC file.  
**Fixes:**
1. Ensure the file is a valid `.ifc` file (not `.rvt`, `.dwg`, etc.).
2. Check the browser console for WASM errors.
3. The file must start with `ISO-10303-21` — export a fresh IFC from your BIM tool.

### WASM loading error in production

**Cause:** `web-ifc.wasm` not being served correctly.  
**Fix:** Ensure Vercel serves `.wasm` files with `Content-Type: application/wasm`. This is automatic for Vercel but may need a `vercel.json` header rule for other hosts.

### "Cross-Origin-Opener-Policy" errors in console

**Cause:** Browser COOP headers blocking WASM workers.  
**Fix:** The `vite.config.ts` sets `Cross-Origin-Opener-Policy: same-origin` in dev. For production on Vercel, add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    }
  ]
}
```

### Build fails: TypeScript errors

**Cause:** Strict TypeScript in CI / Vercel build.  
**Fix:** Run `npm run build` locally and resolve all TypeScript errors before pushing.

---

## 10. Known Limitations

### Browser Support

- **Supported:** Chrome 90+, Firefox 88+, Safari 15+, Edge 90+.
- **Required:** WebGL 2.0, WebAssembly, ES2020+ support.
- **Not supported:** Internet Explorer, older mobile browsers.

### IFC File Limits

- Maximum file size: 200MB (configurable in `IFCUploadService.ts`).
- Supported formats: `.ifc` (IFC STEP format). `.ifczip` support is experimental.
- Very large models (50k+ elements) may be slow to parse — WASM is single-threaded.

### Database Connection

- Neon serverless databases experience a ~1-2 second cold start after inactivity.
- The first request after a cold start may be slower than subsequent ones.
- React Query's retry logic handles transient connection failures.

### No Authentication

- The application has no user authentication.
- All data in the database is shared (no per-user isolation).
- For production use with multiple teams, add an authentication layer.

### No Undo / Redo

- All mutations (create/update/delete) are permanent once committed.
- React Query optimistic updates roll back on failure but there is no user-facing undo.

---

*For architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).*