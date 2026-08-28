# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single cat owner (or small household) tracking food inventory and feeding logs for one or more cats. Not built for multi-tenant/business use (e.g. a shelter or store) — each account's data is private to that user. The defining moment of use is at the kitchen counter, at feeding time, on a phone: "what do I feed my cat right now, and how much do I have left?"

The PRD names five personas, each mapping to a distinct primary need:

| Persona | Primary need |
|---|---|
| The Bulk Buyer | Know what's already in stock before shopping a sale |
| The Multi-Cat Parent | Track meals per cat individually |
| The Expiry Tracker | See expiration dates at a glance |
| The Casual Logger | Log meals with zero inventory setup |
| The Cat Food Connoisseur | Rate meals and track preferences over time |

These are not decorative. The Casual Logger is the reason inventory tracking is optional rather than required, and the Multi-Cat Parent is the reason a pet is a first-class field on every meal log rather than an afterthought.

## Product Purpose

The problem, as stated in the PRD: cat owners who buy in bulk or shop sales buy duplicates of food they already own, don't know what's in stock before a sale, let food expire before it's used, keep no record of what their cat has eaten or liked, and have no easy way to track inventory across multiple food types, sizes, and brands. Existing pet apps are either full health platforms (too complex) or plain notes (too simple) — there is no lightweight, cat-food-focused inventory and meal-logging tool that is free, install-free, and mobile-first.

Pet Pantry helps a cat owner see at a glance what food is in stock and what's expiring soon, and log every meal fast enough to do it at every single feeding — with inventory deducting automatically so stock counts stay accurate without extra bookkeeping. It runs entirely in the browser, no install, free to run and free to use.

Success criteria, as originally specified and since met:

- App deployed and publicly accessible at a live URL.
- Mobile-first responsive design, working in iOS and Android browsers.
- Full registration and sign-in flow.
- **A food item can be added in under 3 taps.**
- **A meal can be logged in under 3 taps.**
- Inventory auto-deducts on meal log when quantity is being tracked.
- Landing page live, with Fenty featured.

The two tap-count targets are the load-bearing ones — they are the only criteria that constrain future design work, and any change that pushes either flow past three taps is a regression regardless of what else it improves.

## Positioning

Not a general pet-management suite (no vet records, health tracking, etc.) — narrowly built for one real, recurring use case: the moment of deciding what to feed and confirming there's enough on hand. Meal logging and inventory are one tightly coupled flow (logging a meal auto-deducts stock; editing/deleting a log correctly reverses it) rather than two separate tools a user has to reconcile by hand.

Explicit non-goals, carried forward from the PRD's V1 scope boundary:

- No nutritional or calorie tracking; no vet appointments or health records. Either would change the product's core focus and needs its own PRD rather than being added as a feature.
- No social features — no sharing of profiles or meal logs.
- No multi-household or shared pantry across logins.
- No push notifications or reminders for expiring food or low stock.
- No shopping list generation, CSV/PDF export, dark mode, or PWA/installable app. These sit in the backlog as wanted-but-unbuilt, not as rejected.

Three original non-goals have since shipped and are no longer out of scope:

- **Cloud database and cross-device sync** — Supabase replaced the original localStorage-only data layer on 2026-07-17. Any doc still describing localStorage as the data layer is superseded.
- **Barcode scanning** — shipped 2026-07-20, ahead of its original "nice to have" target.
- **Photo uploads for food items** — shipped 2026-07-23, up to 5 photos per item.

## Operating Context

Used standing in a kitchen at feeding time, usually one-handed on a phone; also used seated at a desk/laptop for less time-pressured tasks like adding new food items or reviewing meal history. Feeding happens multiple times a day, so the meal-logging path is used far more frequently than inventory setup.

Supporting workflows: adding a food item (via curated brand list, custom entry, or camera barcode scan against Open Food Facts / Open Pet Food Facts), tracking one or more inventory entries per food item, logging a meal against a pet + food with auto-derived serving size, managing multiple pet profiles, and reviewing meal history filtered by date range.

A demo mode (shipped 2026-08-19) lets a visitor use a fully working copy of the app with no account, backed by a localStorage data layer seeded with sample pets, food, and meals. It is reachable at `/demo` and is the path most first-time evaluators will take, so it has to stay representative of the real app rather than drifting into a stale sales fixture.

## Capabilities and Constraints

- Pure HTML/CSS/JS, no build step or framework; deployed to GitHub Pages via GitHub Actions on push to `main`.
- Supabase (Postgres + Auth) is the only backend — called directly from the browser, secured by row-level security rather than a server-side API layer. No traditional backend server exists in this stack.
- Email/password auth via Supabase Auth. Email confirmation is currently disabled for frictionless testing; the PRD flags this as something to reconsider before wider/public use.
- Inventory tracking is optional per food item ("food logging only" mode — an inventory row can have a null quantity, meaning meals are logged without stock being tracked).
- Barcode scanning uses the free, client-side `html5-qrcode` library (camera via `getUserMedia`) against the free Open Food Facts / Open Pet Food Facts public API — no API key, CORS-open. Coverage depends on that crowdsourced database; niche or newer products may not be found and fall back to manual entry. The scanner bundle is lazy-loaded so it stays off the sign-in path.
- Food items support up to 5 photos each, stored via the `photos` array column on `food_items`.
- Single-user-per-account model — no household/family sharing of one pet's data across multiple logins.
- No push notifications or reminders; inventory/expiration status is only visible when the user opens the app.
- No offline support — requires an internet connection to load and use.
- Must run mobile-first with a working desktop layout (bottom tab bar on mobile, sidebar on desktop, ≥768px breakpoint per the existing implementation).
- Cost constraint: must stay $0 to run at current scale — no paid infrastructure for a single-household-scale user base drives technology choices (GitHub Pages, Supabase free tier, free public APIs).

## Brand Commitments

None fixed. The current identity (purple/pink palette, Fenty the developer's cat as landing-page mascot, playful "reviews from cats" joke copy) is the incumbent look, not a locked brand commitment — future design work is free to propose a different visual world.

## Evidence on Hand

- `Fenty the cat` — the developer's own cat, used as the landing page mascot; a real photo asset exists at `public/fenty.jpg`.
- Landing page "testimonials" are written as jokes from the cats' point of view, not real human customer testimonials — future work should preserve that framing (or replace it deliberately) rather than fabricate real-sounding customer quotes/logos/press, none of which exist.
- `Pet Pantry PRD.pdf` (2026-07-20) documents the shipped state of the app: goals, feature set, data model, technical architecture, non-functional requirements, and known limitations.
- `public/pm.html` is an internal, password-gated project tracker holding the original PRD v1.0 (2026-04-23) alongside a backlog, roadmap, and meeting notes. It is internal tooling, not part of the product surface. It persists to a single shared `pm_tracker` row in Supabase (one JSON blob, not per-user), gated client-side by a shared page password rather than by Supabase Auth.
- `.impeccable/critique/2026-08-12T10-43-16Z__public.md` — a design critique scoring the app 19/40 across ten usability heuristics, with the resulting fixes merged in PR #1.
- No case studies, press mentions, or usage metrics exist to cite. The success criteria above are acceptance criteria, not measured user outcomes.

## Product Principles

1. Feeding-time logging must stay fast and thumb-friendly — it's the highest-frequency action and happens standing in a kitchen, often one-handed.
2. Inventory and meal logs are one system, not two — every design and data decision should keep the auto-deduct relationship between them correct and legible.
3. Zero paid infrastructure is a hard constraint, not a preference — features should fit within free-tier Supabase, free public APIs, and static hosting.
4. Optional rigor: a user can track exact quantities or just log meals with no inventory tracking at all — neither mode should feel like the unsupported path.
5. No install, no friction — the browser-only, no-app-store nature of the product is a stated goal, not an accident of the current stack.

## Accessibility & Inclusion

WCAG AA is a live requirement, established by the 2026-08-12 audit and the remediation merged in PR #1 — not an aspiration. The audit found the original accessibility NFR was largely unmet in practice: zero `label`/`for` associations, near-zero `aria-label`s, no keyboard-operable custom controls, no modal focus management, and 50+ contrast findings clustered on the muted purple/pink text tokens.

What the remediation established, and what future work must preserve:

- Every form field is programmatically associated with its label; every icon-only button has an accessible name.
- Custom controls (protein chips, rating chips, card expand toggles) are keyboard-operable.
- Modals trap focus, close on Escape, and restore focus to their trigger on close.
- Body, muted, star-rating, and CTA text meet 4.5:1 against their backgrounds, in both the app shell and the landing page's separate token system.
- Heading hierarchy is unbroken and every page has `<main>`/landmark structure.

Contrast matters more here than the ratio alone suggests: the product is designed to be glanced at in variable kitchen lighting, which makes sub-AA text a real legibility failure rather than a checkbox miss. Dark mode remains unbuilt and is tracked in the backlog; the audit explicitly deferred it as net-new work rather than a fix.
