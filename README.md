# Sommerfest Pot-luck Signup

This is a small Cloudflare Workers app for a pot-luck signup page.

Guests can:

- enter their name
- claim one of the listed items
- remove their own signup later

The current signup state is stored as a single JSON object in Cloudflare R2.

## Edit the list of needed items

Open [src/config.js](C:/Users/johan/OneDrive/Dokumenter/Sommerfest/src/config.js) and edit the `potluckItems` array.

Each item needs:

- `id`: a unique stable id
- `label`: the visible item name
- `details`: a short description

## Local development

1. Install dependencies:

```powershell
npm install
```

2. Create the R2 bucket once in Cloudflare:

```powershell
npx wrangler r2 bucket create sommerfest-potluck
```

3. Start the app:

```powershell
npm run dev
```

## Deploy

1. Make sure you are logged into Wrangler:

```powershell
npx wrangler login
```

2. Deploy:

```powershell
npm run deploy
```

## Notes

- The bucket name is configured in [wrangler.toml](C:/Users/johan/OneDrive/Dokumenter/Sommerfest/wrangler.toml).
- The saved object key defaults to `potluck-state.json`.
- If you want to rename the Worker or bucket, update `wrangler.toml` first.
