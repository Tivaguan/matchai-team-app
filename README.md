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

## Photo credits

The note and coin pictures on the drawer count screen are in `public/money/`.

- Notes 200, 100, 50, 20: pictures of the 2023 series supplied by the project owner.
  The designs belong to Bank Al-Maghrib.
- Coins 5, 2, 1 and 50 c: "5dirhams - 2011", "2dirhams - 2002", "1dirham - 2002",
  "50centimes - 2011" by Hamza Izourane, Wikimedia Commons, CC BY-SA 4.0.
- Coin 10: "10 MAD, reverse" by Raf24, Wikimedia Commons, CC BY-SA 4.0.

The cropped coin pictures are shared under the same CC BY-SA 4.0 license.
