# PNG Parole Management System (PMS)

Web application for Papua New Guinea Correctional Service and DJAG to run parole cases from eligibility through hearing, board decision, grant or refusal, and release.

Built as a DWU final-year project. The live path is the client workflow in `js/workflow.js` and `js/storage.js`, with optional MySQL sync through the Node server.

## Stack

| Area | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express |
| Database | MySQL (WampServer) |
| Auth | Session token (`/api/auth/login`) plus local fallback |

## Run locally

```powershell
cd server
copy .env.example .env
npm install
npm run migrate
npm run seed
npm start
```

Open [http://localhost:3000/index.html](http://localhost:3000/index.html).

See `MYSQL_SETUP.md` for database details. Set `AUTH_REQUIRED=false` in `server/.env` only for local debugging.

## Demo accounts

Password for staff accounts: `Password123!` (admin: `admin123`). Clerk signing PIN: `000000` for `j.dole@cs.gov.pg`. Short usernames such as `j.dole` also work for sign-in and password-reset requests. Other PINs are unique per user; an administrator can reset them.

| Role | Username |
|---|---|
| System Administrator | `admin` |
| CS Parole Clerk | `j.dole@cs.gov.pg` |
| CS Parole Officer | `s.tau@cs.gov.pg` |
| Jail Commander | `p.koroma@cs.gov.pg` |
| DJAG Parole Clerk | `m.kila@djag.gov.pg` |
| DJAG Secretary | `h.morris@djag.gov.pg` |
| Psychiatrist | `r.sine@health.gov.pg` |
| CS Commissioner | `t.bain@cs.gov.pg` |

## Live parole path

1. CS Parole Clerk registers the prisoner and starts Form 1 when eligibility is reached.
2. CS Clerk completes Form 2 DDR; DJAG Clerk completes Form 2 PPR (PIN required).
3. Jail Commander verifies Forms 1–2 (starts the 14-day hearing clock).
4. DJAG Secretary sets the hearing date, time, and venue.
5. CS Clerk records Form 3. Schedule fields match the Secretary page and are view-only.
6. Psychiatrist, CS Commissioner, and DJAG Secretary each vote.
7. Secretary issues Form 4 (grant) or Form 5 (refusal).
8. Secretary and CS Clerk both approve a grant, then the Jail Commander authorizes release.

## Staff tools

- **Grant approvals** — Secretary and CS Clerk dashboards, after Form 4 is issued.
- **Guarantors** — CS Clerk (and Officer view) register community guarantors on a case.
- **User accounts** — System Administrator creates users, resets passwords, and resets 6-digit signing PINs.
- **Forgot password** — staff request a reset from the landing sign-in dialog; the administrator is notified.

## Architecture

The Act 1991 server workflow under `server/src/parole/` is **not mounted**. Do not re-enable it without a policy decision. See `ARCHITECTURE_DECISIONS.md`.
