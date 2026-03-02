# Poke Stamps v3

Poke Stamps is a web app for a Pokemon GO community.

The app has two main surfaces:

1. `Admin / Mod`
   Manages events, collections, stamps, albums, gallery, users, and delivery logs.
2. `User`
   Sees a personal album grouped as `event -> collection -> stamp`.

## Product Model

The current data model is based on reusable entities plus explicit relations:

1. `events`
2. `collections`
3. `stamps`
4. `event_collections`
5. `collection_stamps`
6. `user_stamps`

Important business rules:

1. An event can have many collections.
2. A collection can belong to many events.
3. A collection can have many stamps.
4. A stamp can belong to many collections.
5. A delivered stamp is unique by:
   `user_id + event_id + collection_id + stamp_id`
6. Each delivered stamp persists a `claim_code`.
7. Staff must deliver stamps from `Albumes`, not from the base catalog tabs.

## Stack

1. Frontend: `Next.js` App Router
2. Deploy: `GitHub Pages`
3. Backend / Auth / DB / Storage: `Supabase`
4. Client SDK: `@supabase/supabase-js`

Notes:

1. This project uses static export.
2. The frontend talks directly to Supabase.
3. Security depends on Supabase RLS and policies, not on hiding the public anon key.

## Main Routes

Public / auth:

1. `/`
   Login and registration request flow
2. `/reset-password`
3. `/update-password`

Shell routes:

1. `/user`
   User album
2. `/profile`
   User profile
3. `/admin`
   Redirects to `/admin/albums`

Admin v3 subpaths:

1. `/admin/albums`
2. `/admin/events`
3. `/admin/collections`
4. `/admin/stamps`
5. `/admin/gallery`
6. `/admin/users`
7. `/admin/logs`

## Admin v3

The admin area is split by subpath so each page only loads the data it needs.

Current behavior:

1. `Albumes`
   Operational view for delivering stamps with explicit `event + collection + stamp` context, backed by `admin_get_albums()`.
2. `Eventos`
   Event catalog management, backed by `admin_get_events_overview()`.
3. `Colecciones`
   Collection catalog management and relation management, backed by `admin_get_collections_overview()`.
4. `Stamps`
   Base stamp catalog management, backed by `admin_get_stamps_overview()`.
5. `Galeria`
   Supabase Storage image management.
6. `Usuarios`
   Profile management, authorization, role changes (`user` / `mod` only), deletion of non-admin users, backed by `admin_list_users()`.
7. `Logs`
   Paginated delivery history with explicit search action, backed by `admin_get_logs(...)`.

Navigation behavior:

1. The shared shell uses a local auth snapshot for fast route gating.
2. Admin pages still revalidate real permissions against `profiles` on entry.
3. Sidebar navigation now shows an immediate shell loading overlay while the target page finishes its client-side fetches.

## User Surface

Current behavior:

1. Album grouped as `event -> collection -> stamp`
2. Collapsible event and collection sections
3. Stamp modal with:
   - image
   - awarded date
   - collection
   - event
4. Verification flip with QR
5. `CAD` label showing the persisted `claim_code`

## Auth / Roles

Roles in `profiles.role`:

1. `user`
2. `mod`
3. `admin`

Rules:

1. Public registration is allowed.
2. New users are created with `active = false`.
3. Staff authorizes users from `/admin/users`.
4. The app UI only allows assigning `user` or `mod`.
5. Admin accounts are visible in the users table but cannot be edited or deleted from the app UI.
6. Fast route guards use a local auth snapshot for quick redirects.
7. Admin pages still revalidate real permissions against `profiles` on entry.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Useful scripts:

```bash
npm run lint
npm run test -- --run
npm run build
```

The current pre-push hook runs:

1. `lint`
2. `test`
3. `build`

## Environment Variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Important:

1. `NEXT_PUBLIC_*` values are public in the frontend bundle.
2. `SUPABASE_SERVICE_ROLE_KEY` must never be used in client code.
3. `.env.local` must never be committed.

## Supabase Setup

This repo contains SQL scripts under `supabase/`.

Important scripts already used by the app include:

1. `init_profiles.sql`
2. `core_event_schema.sql`
3. `migrate_relations.sql`
4. `user_stamps.sql`
5. `manage_profiles_staff.sql`
6. `add_claim_code_to_user_stamps.sql`
7. `secure_user_album_access.sql`
8. `harden_admin_access.sql`

Guideline:

1. Apply schema and policy changes through SQL scripts in the repo.
2. Do not rely on dashboard-only changes.

## Security Notes

1. RLS must stay enabled on public tables.
2. Do not expose `auth.users` through public views.
3. Do not commit secrets.
4. Public `anon` access is acceptable only because permissions are enforced in Supabase policies.
5. Privileged operations should use RLS-safe SQL / RPC / Edge Functions, not frontend secrets.
6. The active image upload flow stores new assets under `gallery/` inside the public `poke-stamp-images` bucket.

## Performance Notes

Current performance rules:

1. Admin pages are separated by route to reduce initial data load.
2. Main admin pages now prefer RPC-backed overview reads instead of assembling several relational queries in the client.
3. Backend-paginated views should avoid automatic requests on each keystroke.
4. `Logs` now searches only when the user presses `Buscar`.
5. Search terms shorter than 3 characters should not trigger expensive backend filtering.
6. `/user` now loads from local snapshot + `get_my_album_entries()` and no longer fetches `profiles` on entry.
7. Shared shell navigation uses an immediate loading overlay so route changes feel responsive even when page data is still loading client-side.

## Deploy

Deployment target is GitHub Pages through GitHub Actions.

Before pushing:

1. make sure repo Actions variables are configured
2. verify `npm run build` passes locally when possible

Required repo Actions variables:

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Known Technical Debt

1. Several pages still use `<img>` instead of `next/image`.
2. Admin edit modals still fetch some auxiliary datasets directly (`collections`, `events`, `stamps`) for checkbox/picker UIs.
3. `Gallery` still uses a public bucket; listing is now staff-only by policy, but a known public URL remains accessible while the bucket stays public.
4. Legacy storage folders like `events/`, `collections/`, and `stamps/` may still exist in old environments; the active upload flow now targets `gallery/`.
5. `profile_session_controls.sql` is no longer part of the active frontend flow and should be removed or replaced if session invalidation is revisited.
6. SQL and policy drift should be kept under control by updating the scripts in `supabase/`.
