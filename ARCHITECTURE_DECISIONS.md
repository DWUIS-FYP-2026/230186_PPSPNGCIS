# Architecture Decisions

## ADR-001: Consolidate on Legacy Parole Workflow (2026-09-14)

### Background

The Parole Management System (PMS) had two parallel workflow implementations:

1. **Legacy client workflow** — `js/workflow.js` (steps, transitions, role guards) and `js/storage.js` (localStorage/bootstrap persistence, eligibility, board vote tally, status transitions). This is what the live UI uses today.

2. **Partial Act 1991 server workflow** — `server/src/parole/` (eligibility engine, state machine, board engine, Form 1 builder) exposed via `/api/parole` routes in `server/src/routes/parole.js`. Applications created through this path use `workflow_version = 'act1991'` in MySQL.

At the time of this decision, production had **zero live Act 1991 data** (`workflow_version = 'act1991'` rows). All active cases run through the legacy path. The frontend mirror calls to `/api/parole/*` were already gated behind `act1991ParoleSyncEnabled` (default `false`).

### Decision

**Consolidate on the legacy workflow as the single active system.**

Verified improvements from the Act 1991 implementation were ported into legacy before unmounting the server routes:

| Improvement | Legacy location |
|-------------|-----------------|
| **(a) Life sentence eligibility date** — `eligibilityDate = SSD + 10 years` when `sentenceType === 'Life'` | `js/storage.js` — `getParoleEligibilityDate()`, `getPrisonerProgress()` |
| **(b) Form 1 display reconciliation** — Form 1 no longer recalculates eligibility independently; it calls `PMSStorage.getParoleEligibilityDate()` | `js/form1-parole.js` — `formatParoleEligibilityDate()` |

Board vote logic was confirmed unchanged: `calculateBoardVotes()` in `js/storage.js` uses **simple majority** (`Approved > Refused`), not an percentage threshold.

### What Was Unmounted (Not Deleted)

In `server/src/server.js`, the `/api/parole` route mount was commented out with a dated note (2026-09-14):

```js
// app.use('/api/parole', paroleRouter);
```

The following remain in the codebase for reference and possible future use:

- `server/src/parole/` — domain logic (eligibility, state machine, board engine, Form 1 builder, documents)
- `server/src/routes/parole.js` — route definitions
- `server/src/jobs/parole-eligibility-job.js` — daily Act 1991 eligibility promotion job (still starts at server boot; no-op while no `act1991` rows exist)

Legacy API routes under `/api/applications/*` (e.g. `POST /api/applications/:id/form1`) remain active and are unaffected.

### What Was Cleaned Up

- Removed the inaccurate **"80% threshold"** wording from workflow step 12 documentation in `js/workflow.js`.
- Removed the unused **`PAROLE_APPROVAL_THRESHOLD`** constant and its export from `js/storage.js`.
- Removed the dead **`THRESHOLD`** variable from `js/hearing-portal.js` (assigned but never read).

`calculateBoardVotes()` logic was **not** changed — only documentation and dead code.

### Known Open Items (Policy / Compliance Review Required)

These features exist only in the unmounted Act 1991 code. **Do not implement in legacy without a formal policy decision:**

1. **6-month pre-notification window** — Act 1991 sends a notification six months before formal parole eligibility (`calculateNotificationDate` in `server/src/parole/eligibility.js`). Legacy notifies at eligibility threshold only.

2. **Sentence-length-scaled reapply cooldown** — Act 1991 uses 6 months for standard sentences under 5 years, 12 months for ≥ 5 years or Life (`calculateCooldownMonths`). Legacy uses a flat 6-month default.

3. **Mandatory community safety score veto** — Act 1991 `board-engine.js` can deny parole when community safety score is below threshold, independent of a majority board vote. Legacy board decisions follow vote tally only.

### How to Re-Enable Act 1991 (If Required Later)

1. Uncomment the route mount in `server/src/server.js`:
   ```js
   app.use('/api/parole', paroleRouter);
   ```

2. Enable frontend mirror sync via either:
   - System settings: `act1991ParoleSyncEnabled: true` (via `PMSStorage.saveSettings()`), or
   - Local testing override: `window.PMS_ENABLE_ACT1991_SYNC = true` in the browser console.

3. Ensure MySQL applications use `workflow_version = 'act1991'` for cases that should follow the server state machine.

4. Re-run the server test suite: `cd server && npm test`.

### Related Files

| File | Role |
|------|------|
| `js/workflow.js` | Active workflow steps and transitions |
| `js/storage.js` | Active persistence, eligibility, board votes |
| `server/src/server.js` | Route mounting (Act 1991 unmounted) |
| `server/src/parole/` | Preserved Act 1991 domain logic |
| `roles-workflow.html` | User-facing workflow reference |
