# CJM Marine

Vessel maintenance and crew platform from the CJM marine division.
React + Vite on Netlify, with Google Sheets + Apps Script as the backend.

- **Vessels**: each vessel has its own maintenance program, crew and positions. People only see vessels they belong to.
- **Accounts**: the CJM admin creates vessels and their Captain or Owner. Captains and Owners add crew by email. People without an account can request one from the login page.
- **Moving between vessels**: inviting an email that already has an account sends an invitation. Their profile, experience and reviews come with them.
- **Crew profiles**: photo, headline, certifications with expiry, experience, availability, and a business card (.vcf download and print).
- **Find crew**: Owners and Captains search all crew by free text, position and availability.
- **Reviews**: Owners and Captains rate crew who served on their vessel. Crew see their own reviews.
- **Business card QR codes**: the back of the card has a "Save contact" code (vCard) and a "Read my reviews" code. The reviews page needs no login and hides reviewer names. Crew turn it on in My profile.
- **Titles and access levels**: 39 job titles in 7 groups from the CJM Marine Crew Role Reference. A title is descriptive only. What someone can do comes from their access level (Command, Owner oversight, Department lead, Qualified crew, Supervised crew, External contractor, View only) and departments (deck, engineering, interior, galley, medical, security), set by the Captain. Contractors see only jobs assigned to them and earn no sea time.
- **Work reviews**: after signing off a task, crew can ask the Captain to review that work (1 to 10 plus a comment). Reviewing is optional; the Captain can skip. Scores stay on the crew member's record across boats and show on their profile, in Find crew and on the QR reviews page.
- **Crew record backup**: every 7 days each crew member is emailed a Google Sheet of their sea time per vessel, certifications, work reviews, recommendations and 12-month work log, with an Excel copy. They can also send it any time from My profile.
- **Daily backup**: each morning every vessel's open tasks, open issues and 30 days of sign-offs become a Google Sheet in Drive → "CJM Marine backups". Captains get their vessel's sheet by email with an Excel copy attached. CJM admins get one email covering all vessels.

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

## Upgrade to 2.1 (QR codes and daily backups)
1. Paste the new `apps-script/Code.gs` into Apps Script and save.
2. Choose `setupBackups` in the function menu and click Run. Approve the new Google Drive permission. This installs the daily backup and emails a first backup right away.
3. Deploy → Manage deployments → pencil → New version → Deploy.
4. Upload this folder to GitHub (Netlify rebuilds on its own).
5. CJM admin tab should show `Google Script version: 2.1 (QR business cards, daily backups)`.

## Upgrade to 2.2 (work reviews, crew records)
1. Paste the new `apps-script/Code.gs` into Apps Script and save. The TaskReviews tab is created automatically.
2. Optional: run `setupBackups` again to send everyone their first crew record now. Otherwise it starts with the next morning's backup.
3. Deploy → Manage deployments → pencil → New version → Deploy.
4. Upload this folder to GitHub.
5. CJM admin tab should show `Google Script version: 2.2 (work reviews, crew record backups)`.

## Upgrade to 2.3 (titles and access levels)
1. Paste the new `apps-script/Code.gs` into Apps Script and save. New columns are added automatically; no setup to run.
2. Deploy → Manage deployments → pencil → New version → Deploy.
3. Upload this folder to GitHub.
4. Existing crew keep exactly the rights they had (old Captain → Command, Owner → Owner oversight, Chief Engineer → Department lead for all departments, Engineer → lead engineering, Bosun → lead deck, Interior → qualified interior and galley, Deckhand → supervised).
5. CJM admin tab should show `Google Script version: 2.3 (crew titles and access levels)`.

## Upgrade to 2.4 (operating area, public landing page)
1. Paste the new `apps-script/Code.gs` into Apps Script and save. The Profiles tab gets an `operatingArea` column automatically.
2. Deploy → Manage deployments → pencil → Version: **New version** → Deploy.
3. Upload this folder to GitHub (include the `public/landing` images). Netlify rebuilds on its own.
4. Visitors who are not logged in now see the landing page at `/`. The login form is at `/login`; `/privacy` opens the privacy section.
   Setup links, sign-up links (`/?request=1`) and review links (`/?r=…`) work as before.
5. Check `COMPANY` in `src/contact.js` (legal name and region shown on the landing page).
6. CJM admin tab should show `Google Script version: 2.4.1 (sign-in link emails)`.
7. `APP_URL` in `CONFIG` is now filled in with https://cjm-marine-1.netlify.app. If you move the site to a new address, change it there. New members get a "Set your password" button and the link as text.

## Upgrade to 2.5 (photos and files on notes)
1. Paste the new `apps-script/Code.gs` into Apps Script and save. The Attachments tab is created automatically.
2. Deploy → Manage deployments → pencil → Version: **New version** → Deploy. If Google asks for permission again, allow it (the script saves files to your Drive).
3. Upload this folder to GitHub.
4. In a task, Notes now has **Attach photo or file** (photos, PDF, Word, Excel, text, short videos; up to 6 files, 10 MB each). Photos are shrunk to 1600 px before upload.
   Files are saved privately in your Google Drive folder **CJM Marine attachments / <vessel>**. Only that vessel's crew can open them in the app (contractors only on their own jobs).
5. Web addresses typed or pasted in notes, descriptions, resolutions and the activity log are clickable.
6. CJM admin tab should show `Google Script version: 2.5 (photos and files on notes)`.

## Upgrade to 2.6 (login codes, 15-character passwords)
1. Paste the new `apps-script/Code.gs` into Apps Script, save, then Deploy → Manage deployments → pencil → **New version** → Deploy.
2. Upload this folder to GitHub.
3. CJM admins and anyone with Command or Owner oversight access on a vessel now get a 6-digit code by email after entering their password, at every login.
   The code works for 10 minutes (`CONFIG.LOGIN_CODE_MINUTES`), 5 wrong tries cancel it, and at most 5 codes are sent per 15 minutes.
   Demo/test accounts (.test addresses) skip the code. Password reset and new-account setup links already prove the email, so they log in directly.
4. New and changed passwords must be at least 15 characters with letters and numbers (`CONFIG.PASSWORD_MIN`). Existing passwords keep working until changed.
5. CJM admin tab should show `Google Script version: 2.6 (login codes, 15-character passwords)`.

## Demo vessel (2.5.1)
- In Apps Script choose `createDemoVessel` next to Run and press Run (about a minute). It builds **M/Y Meridian Star** (118 ft) with 5 crew, an owner and a contractor.
- Demo logins (password `Meridian2026`): ryan.calder@ (Captain), marco.bellini@ (Chief Engineer), jake.turner@ (Bosun), sophie.laurent@ (Chief Stewardess),
  liam.oneill@ (Deckhand), daniel.hart@ (Owner) — all `@meridianstar.test` — and service@coastline-stab.test (contractor).
- `.test` addresses never receive email: the script skips them. Demo crew are hidden from real customers in Find crew.
- To take it down: run `removeDemoVessel`.

## Fresh install
Same as above on a new, empty Google Sheet. `setupPlatform()` creates the tabs and your admin account. Then create vessels from the CJM admin tab.

## Where things live
- Job titles, access levels and departments: `TITLE_LIST`, `ACCESS` and `DEPARTMENTS` near the top of `apps-script/Code.gs`.
- Reminder timing and colors: `CONFIG` in `apps-script/Code.gs`.
- After any change to `Code.gs`: Deploy → Manage deployments → Edit → **New version**.
