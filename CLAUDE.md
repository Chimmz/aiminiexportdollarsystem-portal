# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

This project uses **pnpm**, not npm/yarn.

- `pnpm dev` — start the dev server (Turbopack)
- `pnpm build` — production build
- `pnpm start` — run a production build
- `pnpm lint` — ESLint (flat config, `eslint.config.mjs`)

There is no test suite configured yet (no `test` script, no test framework installed).

## Architecture

### This repo is one half of a two-codebase product

This app is the **post-payment member portal only**. A separate, sibling codebase (`mini-export-web`, not in this repo) is the public sales/funnel site — it collects leads, runs Paystack checkout, and writes `leads`/`payments` rows directly into the **same Supabase project** this app uses. This app never runs a payment webhook itself. The handoff: after paying on the sales site, the buyer is sent here to sign in via magic link; `src/app/auth/callback/route.ts` then calls `src/lib/leads/convert-lead.ts`, which finds the matching `leads` row by email, links it to the newly-created `users` row, and creates (unactivated) `access_periods` for any of that lead's unlinked successful payments. Every mutation after that point — users, access, extracted chat memory — happens only from this app.

### Auth: magic link only, no passwords

- `src/proxy.ts` — **not** `middleware.ts`. Next.js 16 renamed the convention (file and export name); this project is on 16, and `node_modules/next/dist/docs/` is the source of truth for anything that looks different from training data (see AGENTS.md). This file refreshes the Supabase session cookie on every request and gates `/dashboard/*` — signed-out visitors are redirected to `/sign-in`, signed-in visitors are redirected away from `/sign-in`.
- `src/lib/supabase/client.ts` / `server.ts` wrap `@supabase/ssr` for browser and server (Server Components/Actions/Route Handlers) use respectively — both RLS-enforced, scoped to the signed-in user.
- `src/lib/supabase/service.ts` creates a service-role client that bypasses RLS. Server-only; used by the RAG lab routes and one-off lead/payment linking. Never import this into anything that could end up in a client bundle.

### Data layer: `src/lib/utils/` (pure) vs `src/lib/actions/` (DB/API calls)

`src/lib/utils/*-utils.ts` files hold only pure helpers — types, constants, and functions with no I/O (formatting, mapping a DB row shape to a UI shape, matching/filtering in-memory data). Anything that actually talks to Supabase or an external API lives in a same-domain `src/lib/actions/*-actions.ts` file instead (e.g. `contacts-utils.ts`'s `ContactCard` shape and row→card mappers vs `contacts-actions.ts`'s `searchContacts()`; `journey-utils.ts`'s step definitions vs `journey-actions.ts`'s `updateStepProgress()`; `fx-actions.ts`'s `getUsdToNgnRate()` has no pure counterpart at all, since it's nothing but a fetch). When adding a function, ask whether it does I/O — if yes, it's an action, not a util, even if it's small.

`getCurrentUser()` (`src/lib/actions/user-actions.ts`) is the single source of truth for the signed-in user's base profile (id, email, name) — it returns `null` instead of redirecting when there's no session, so it's safe to call from a Route Handler (e.g. `/api/mentor/chat`) as well as a Server Component. `getCurrentUserFirstName(user)` (`src/lib/utils/user-utils.ts`) is a pure derivation on top of it, not a separate fetch. `requireCurrentUser()` (same actions file) is the Server-Component-only variant: it redirects to `/sign-in` when signed out and additionally resolves plan/access status and onboarding signals. Both are wrapped in React's `cache()`, so calling either (or both) from `dashboard/layout.tsx` and a page in the same render dedupes into one set of queries rather than several. Every dashboard page follows the same shape: a thin async Server Component (`page.tsx`) calls `requireCurrentUser()` and passes the result as props into a `"use client"` component that holds the actual UI/interactivity.

### Billing model: stacked access windows, not subscriptions

Plans are prepaid, flat-fee access periods (30-day/3-month/6-month), not recurring subscriptions. `access_periods` chain back-to-back and can span different purchased tiers over time — there is **no single "current tier"** in the way a subscription model would have one. What's well-defined instead is "is access active right now, and until when" (the `user_access_status` SQL view) and "which plan backs whatever period is in effect at this exact moment" (`AccessStatus.currentPlanId` in the DAL, resolved via the `access_periods` row where `starts_at <= now() < ends_at`).

Activation (`access_periods.starts_at`/`ends_at`, `users.activated_at`) is deliberately deferred until the user's first mentor message — not "first login." That trigger point doesn't exist yet because the chat itself isn't wired to a backend (see below), so newly-converted access periods sit unactivated until that's built.

### Database: two manually-run SQL files, no migration tool

`supabase/schema.sql` (RAG lab: `kb_chunks`, pgvector, `match_kb_chunks` RPC) and `supabase/schema_app.sql` (core app: `users`, `leads`, `plans`/`payments`/`access_periods` + `user_access_status` view, and the extracted-chat-memory table `profile_facts`). Both are meant to be pasted into the Supabase SQL editor by hand — there's no CLI/migration tooling. Both are written to be idempotent (`if not exists` / `create or replace` throughout, `drop policy if exists` before every `create policy`), so re-running either after an edit is always safe. Incremental changes beyond the initial paste go in `supabase/migrations/` (one file per change, never folded back into these two).

RLS is enabled on every table. Tables with no legitimate end-user access path (`leads`, `kb_chunks`) get RLS enabled with **zero policies** — that's intentional, not incomplete: it denies `anon`/`authenticated` by default (who can otherwise hit any `public` table directly via Supabase's REST API regardless of what this app's own code does) while the service-role client still bypasses RLS as usual.

Naming note: the account-holders table is `users`, deliberately not `buyers` — in this product's domain, "buyer" means the people *our* user (an exporter) sells to, a distinct domain concept from the account-holder. Reusing the word for account-holders would make every join and every conversation about this schema ambiguous.

### Mentor chat UI is built but not connected

`/dashboard/mentor` (`src/app/dashboard/mentor/`) uses the Vercel AI Elements kit (`src/components/ai-elements/` — `Conversation`, `Message`, `PromptInput`, `Reasoning`, `Suggestion`, backed by `ai`, `streamdown`, `use-stick-to-bottom`) for the full chat look and feel, but it's intentionally **not wired to any model or API** — replies are local dummy state on a timer. Don't assume this page talks to a backend.

### Dev-only routes

`/dev/rag-lab` (chunking/embedding lab, Cohere embed-v4.0, 1536-dim vectors in `kb_chunks`) and `/dev/style-preview` are both gated out of production (`NODE_ENV === "production"` → `notFound()`), and the sidebar only links to `/dev/rag-lab` outside production too. Treat anything under `src/app/dev/` as never shipping.

### Styling conventions

- Tailwind v4. Design tokens live in `src/app/globals.css` as CSS custom properties (`--shadow-soft`, `--shadow-popover`, `--accent-gold`, a fluid type scale via `clamp()`), re-exposed through `@theme inline`.
- Dark mode is deliberately inert: `@custom-variant dark (&:is(.dark *))` requires a `.dark` class that nothing in the app ever adds — this is intentional, documented in a comment in `globals.css`, not a bug to "fix" by adding a theme toggle.
- `cn()` is imported from the `"cn"` package (a drop-in clsx + tailwind-merge), not a local reimplementation — see `src/lib/utils/index.ts`.
- Three fonts are loaded via `next/font/google` with `subsets: ["latin"]` only (Jost, League Spartan, SUSE). That subset doesn't include the Naira sign (₦, U+20A6) — rendering it inline with Latin-subset text causes a font-fallback glyph-metrics mismatch that visually corrupts the text. Currency strings must isolate the ₦ glyph in its own span with an explicit system-font stack; see `formatNaira()` in `src/app/dashboard/upgrade/upgrade-page-client.tsx` for the pattern.

### Module organization: modular, not fragmented

Prefer small, single-purpose files grouped by concern over one file doing everything or logic re-declared inline at every call site — e.g. `src/lib/ai/models.ts` (model definitions only: `chatModel`, `embeddingModel`), `src/lib/mentor/chat.ts` (prompt-building only), `src/lib/mentor/retrieve.ts` (retrieval only). But don't fragment for its own sake: a two-line constant doesn't need its own file, and a helper used in exactly one place can usually just live next to that call site instead of being extracted pre-emptively. Split when something has its own clear responsibility or is actually reused across files, not by default.

### Known gaps (intentional, not bugs)

No Paystack webhook in this repo (lives in `mini-export-web`). The Account page's profile-edit form and the "Delete account" button are UI-only (no server action yet — deletion is planned as a soft-delete via `users.deleted_at`, not implemented). The extracted-memory table (`profile_facts`) has no UI or write path yet.
