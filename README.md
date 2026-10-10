# CJM Marine 

Vessel maintenance and crew platform from the CJM marine division.
React + Vite on Netlify, with Google Sheets + Apps Script as the backend.

- **Vessels**: each vessel has its own maintenance program, crew and positions. People only see vessels they belong to.
- **Accounts**: the CJM admin creates vessels and their Captain or Owner. Captains and Owners add crew by email. People without an account can request one from the login page.
- **Moving between vessels**: inviting an email that already has an account sends an invitation. Their profile, experience and reviews come with them.
- **Crew profiles**: photo, headline, certifications with expiry, experience, availability, and a business card (.vcf download and print).
- **Find crew**: Owners and Captains search all crew by free text, position and availability.
- **Reviews**: Owners and Captains rate crew who served on their vessel. Crew see their own reviews.

## Upgrade from the single-vessel Karyatis version

1. **Back up**: open the Karyatis Google Sheet and use File → Make a copy.
2. **Apps Script**: Extensions → Apps Script. Replace all the code with `apps-script/Code.gs` and save.
   - In `CONFIG` near the top, set `APP_URL` to your Netlify address, e.g. `https://karyatismx.netlify.app`.
   - In `setupPlatform()`, set `ADMIN_EMAIL` to your login email. `ADMIN_PASSWORD` is only used if that email has no account yet.
   - Choose `setupPlatform` in the function menu and click Run. Allow the permissions.
   - Your Karyatis crew, tasks and history move into a vessel named Karyatis. Everyone keeps their password.
3. **Deploy**: Deploy → Manage deployments → pencil → Version: **New version** → Deploy.
   Who has access must be **Anyone**. If the URL contains `/a/macros/<your-domain>/`, access is limited to your company domain and crew cannot log in.
4. **GitHub**: upload everything in this folder to the repo (top level, not inside `src`) and commit. Netlify rebuilds on its own.
5. **Check**: log in and open **CJM admin**. The bottom of the page should say `Google Script version: 2.0 (CJM Marine multi-vessel)`.

## Fresh install
Same as above on a new, empty Google Sheet. `setupPlatform()` creates the tabs and your admin account. Then create vessels from the CJM admin tab.

## Where things live
- Positions and their rights: `POSITIONS` and `DEPARTMENTS` at the top of `apps-script/Code.gs`.
- Reminder timing and colors: `CONFIG` in `apps-script/Code.gs`.
- After any change to `Code.gs`: Deploy → Manage deployments → Edit → **New version**.
