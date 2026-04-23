# 🐾 Pet Pantry

> A modern, mobile-first cat food inventory & meal logging web app — built for GitLab Pages.

## Features

| Page | What it does |
|------|-------------|
| **Sign In / Register** | User accounts stored in `localStorage` |
| **Food Inventory** | Add food items, filter by type, expand cards to see expiration dates & quantities, inline adjust inventory |
| **Meal Logs** | Log meals with pet, food (auto-deducts inventory), serving size, cat rating, and notes |
| **My Pets** | Add/edit/delete pet profiles |
| **My Profile** | Edit name, email, password; view stats |

## How to Deploy to GitLab Pages

1. Create a new GitLab project
2. Push this entire folder as your repo root:
   ```bash
   git init
   git add .
   git commit -m "Initial commit – Pet Pantry"
   git remote add origin https://gitlab.com/<username>/<project>.git
   git push -u origin main
   ```
3. GitLab CI/CD will automatically run and publish your site at:
   `https://<username>.gitlab.io/<project>/`

## Tech Stack

- Pure **HTML + CSS + JavaScript** — zero dependencies
- **localStorage** as the database (per-browser, per-user)
- Mobile-first responsive layout with bottom tab bar on mobile, sidebar on desktop
- Inter font from Google Fonts
- Smooth modals, toast notifications, inline editing

## Data Model

```
users          { id, name, email, password, createdDate, lastModifiedDate }
pets           { id, userId, name, gender, age, breed, createdDate, lastModifiedDate }
food_items     { id, userId, brand, name, type, sizeNum, sizeUnit, proteins[], color, purchased, createdDate, lastModifiedDate }
inventory      { id, userId, foodItemId, expirationDate, inventoryNumber }
meal_logs      { id, userId, dateTime, petId, inventoryTableId, foodLabel, size, amount, catRating, note, createdDate }
```

> **Note:** `inventoryNumber` can be `null` — this means "food logging only" mode with no inventory tracking.
