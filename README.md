# Karyatis Maintenance Log

Crew maintenance and issue tracker for the vessel Karyatis.
React + Vite frontend on Netlify, Google Sheets + Apps Script backend.

## Backend (one time)
1. New Google Sheet → Extensions → Apps Script → paste `apps-script/Code.gs`.
2. Project Settings → set the time zone.
3. Run `setup()`, then edit and run `createFirstAdmin()`. Remove the password from the code after.
4. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Copy the `/exec` URL.

## Frontend
```
npm install
cp .env.example .env      # paste the /exec URL into VITE_API_URL
npm run dev
```

## Deploy
1. Push this folder to a new GitHub repo.
2. Netlify → Add new site → Import from GitHub → pick the repo (build settings come from `netlify.toml`).
3. Site configuration → Environment variables → add `VITE_API_URL` with the `/exec` URL → redeploy.
4. Put the Netlify URL in `CONFIG.APP_URL` in Code.gs so reminder emails link to the app.

When you change Code.gs, use Deploy → Manage deployments → Edit → New version so the URL stays the same.

## Positions
Captain, Chief Engineer, Engineer, Bosun, Interior, Deckhand. The Captain sets each person's position on the Crew tab.
Rules live in `POSITIONS` and `DEPARTMENTS` at the top of `apps-script/Code.gs`.
Accounts created before positions existed: admin counts as Captain, crew as Deckhand.
