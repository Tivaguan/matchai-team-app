# Matchai Team App

Internal app for the Matchai shop: stock, cashier log, expenses, weekly availability and schedule.

Next.js (App Router), TypeScript, Tailwind v4, shadcn/ui, TanStack Query, Supabase.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. `npm run dev`

## Scripts

- `npm run dev` starts the app locally.
- `npm run build` builds it for production.
- `npm run lint` checks the code with oxlint.
- `npm run typecheck` checks the types.

## Database

Every database change is a migration file in `supabase/migrations/`. Never change the database by hand in the Supabase dashboard.

- New migration: `supabase migration new <name>`
- Apply to the linked project: `supabase db push`
