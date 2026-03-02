# Poke Stamps v3

Poke Stamps is a web app for a Pokemon GO community.

The app has two main surfaces:

1. `Admin / Mod`
   Manage events, collections, stamps, gallery, users, and delivery logs.
2. `User`
   View a personal stamp album grouped by event and collection.

## Stack

1. `Next.js` App Router
2. `Supabase` for Auth, Database, and Storage
3. `GitHub Pages` for deployment

## Main Routes

1. `/`
   Login and registration request flow
2. `/user`
   User album
3. `/profile`
   User profile
4. `/admin`
   Admin area

## Local Setup

Install dependencies:

```bash
npm install
```

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

Run the app:

```bash
npm run dev
```

## Useful Scripts

```bash
npm run lint
npm run test -- --run
npm run build
```

## Supabase Setup

This repo includes SQL scripts in `supabase/`.

The main scripts currently required by the app are:

1. `init_profiles.sql`
2. `core_event_schema.sql`
3. `migrate_relations.sql`
4. `user_stamps.sql`
5. `manage_profiles_staff.sql`
6. `add_claim_code_to_user_stamps.sql`
7. `secure_user_album_access.sql`
8. `harden_admin_access.sql`

Apply them from Supabase SQL Editor as needed for your environment.

## Deploy

Deployment target is GitHub Pages through GitHub Actions.

Repository Actions variables required:

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Before pushing:

1. verify `npm run lint`
2. verify `npm run test -- --run`
3. verify `npm run build`
