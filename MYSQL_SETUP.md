# PMS MySQL Integration (WampServer)

Full two-way sync between the PMS UI and MySQL — institutions, users, prisoners, applications, documents, and more.

## Quick start

```powershell
cd server
copy .env.example .env
npm install
npm run migrate
npm run seed
npm start
```

Open [http://localhost:3000/index.html](http://localhost:3000/index.html) and sign in (API auth is enabled by default).

## Authentication

Protected routes require a **Bearer token** from login.

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Token |
| GET | `/api/auth/me` | Token |
| GET | `/api/health` | Public |
| GET | `/api/bootstrap` | Token (auto-seeds if DB empty on first call) |
| PUT | `/api/bootstrap` | Token |
| POST | `/api/bootstrap/seed` | Token + **Admin only** |
| GET/POST/DELETE | `/api/prisoners/:id/documents` | Token (POST/DELETE: PNGCS Clerk) |

Sessions are stored in `api_sessions` and expire after **8 hours** (configurable).

Set `AUTH_REQUIRED=false` in `server/.env` only for local debugging.

### Login flow

1. Login page calls `POST /api/auth/login` with username/email + password.
2. Server validates against `users` + `user_credentials`, returns `{ token, user }`.
3. Token is saved to `sessionStorage` (`pms_api_token`).
4. All bootstrap/sync requests include `Authorization: Bearer <token>`.

## Prisoner documents

Supporting documents are stored in **`prisoner_documents`** (not the legacy JSON column on `prisoners`).

| Column | Description |
|--------|-------------|
| `id` | e.g. `DOC-000001` |
| `prisoner_id` | FK → `prisoners.id` |
| `name` | File name |
| `mime_type` | Content type |
| `file_size` | Bytes |
| `data_url` | Base64 data URL (demo/local) |
| `uploaded_by` | User ID |
| `uploaded_at` | Timestamp |

Upload via the prisoner edit form — documents sync to MySQL on save with the full bootstrap snapshot.

Direct API:

```http
POST /api/prisoners/PR-000001/documents
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "court-order.pdf", "type": "application/pdf", "size": 12345, "dataUrl": "data:..." }
```

## Entities synced

| Entity | Table | Seed count |
|--------|--------|------------|
| Institutions | `institutions` | 19 |
| Users / commanders | `users` | 23 |
| Passwords | `user_credentials` | demo accounts |
| Prisoners | `prisoners` | 3 |
| Prisoner documents | `prisoner_documents` | 0+ |
| Applications | `parole_applications` | 3 |
| Hearings | `hearings` | 1 |
| Notifications | `notifications` | 4 |
| Audit logs | `audit_logs` | 4 |
| Reports | `reports` | 1 |
| Settings / counters | `system_settings`, `id_counters` | JSON rows |
| API sessions | `api_sessions` | active logins |

## Configuration (`server/.env`)

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=pms_db
PORT=3000
AUTH_REQUIRED=true
SESSION_TTL_HOURS=8
```

## Demo logins

| Role | Username | Password |
|------|----------|----------|
| System Administrator | admin | admin123 |
| CS Parole Clerk | j.dole@cs.gov.pg | Password123! |
| DJAG Parole Clerk | m.kila@djag.gov.pg | Password123! |
| DJAG Secretary (Board) | h.morris@djag.gov.pg | Password123! |
| CS Commissioner (Board) | t.bain@cs.gov.pg | Password123! |
| Doctor (Board) | r.sine@health.gov.pg | Password123! |
| Jail Commander (Bomana) | p.koroma@cs.gov.pg | Password123! |

Board member accounts include a **5-year contract** (`contractStartDate` → `contractExpiryDate`). Expired contracts are deactivated automatically on login.

## Verify in MySQL Workbench

```sql
USE pms_db;
SELECT COUNT(*) FROM institutions;
SELECT id, name FROM institutions ORDER BY id;
SELECT * FROM prisoner_documents;
SELECT token, user_id, expires_at FROM api_sessions;
```
