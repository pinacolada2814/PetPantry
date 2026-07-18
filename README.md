# 🐾 Pet Pantry

> A modern, mobile-first cat food inventory & meal logging web app — built for GitHub Pages, backed by Supabase.

## Features

| Page | What it does |
|------|-------------|
| **Landing** (`index.html`) | Marketing page introducing the app, with Fenty the cat as mascot |
| **Sign In / Register** (`app.html`) | User accounts via Supabase Auth |
| **Food Inventory** | Add food items, filter by type, expand cards to see expiration dates & quantities, inline adjust inventory |
| **Meal Logs** | Log meals with pet, food (auto-deducts inventory), serving size, cat rating, and notes |
| **My Pets** | Add/edit/delete pet profiles |
| **My Profile** | Edit name, email, password; view stats |

## Database Setup (Supabase)

The app is static (HTML/CSS/JS) and talks directly to a [Supabase](https://supabase.com) project — a hosted Postgres database with built-in auth. You need your own free project:

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. In the dashboard, go to the **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `pets`, `food_items`, `inventory`, and `meal_logs` tables with row-level security so each user can only see their own data.
3. Go to **Project Settings → API** and copy your **Project URL** and **anon public key**.
4. Paste those into [`public/config.js`](public/config.js):
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
   ```
5. (Optional, for easier local testing) In **Authentication → Providers → Email**, turn off "Confirm email" so new accounts can sign in immediately instead of needing to click a confirmation link.

`config.js` holds the public anon key, which is safe to expose in client code — access to your data is enforced by the row-level security policies in `schema.sql`, not by keeping the key secret.

## How to Deploy to GitHub Pages

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the repo on GitHub, go to **Settings → Pages**, and under "Build and deployment" set **Source** to **GitHub Actions**. (One-time setup — only needed the first time.)
3. Push to `main`. The included [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) workflow will run automatically and publish the `public/` folder at:
   `https://<username>.github.io/<repo>/`

## Tech Stack

- Pure **HTML + CSS + JavaScript** — no build step
- **Supabase** (Postgres + Auth) as the database, called directly from the browser via `@supabase/supabase-js`
- Mobile-first responsive layout with bottom tab bar on mobile, sidebar on desktop
- Inter font from Google Fonts
- Smooth modals, toast notifications, inline editing

## Data Model

User accounts (id, name, email, password) live in Supabase's built-in `auth.users` table. Everything else is in `public` tables, scoped per-user by row-level security — see [`supabase/schema.sql`](supabase/schema.sql):

```
pets           { id, userId, name, gender, age, breed, createdDate, lastModifiedDate }
food_items     { id, userId, brand, name, type, sizeNum, sizeUnit, proteins[], color, purchased, createdDate, lastModifiedDate }
inventory      { id, userId, foodItemId, expirationDate, inventoryNumber }
meal_logs      { id, userId, dateTime, petId, inventoryTableId, foodLabel, size, amount, catRating, note, createdDate }
```

> **Note:** `inventoryNumber` can be `null` — this means "food logging only" mode with no inventory tracking.
