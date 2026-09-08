# PMS Database Integration

## Architecture

- **Frontend:** `PMS/` — HTML/CSS/JS dashboards and forms
- **Backend:** `../ParoleManagementSystem/` — ASP.NET Core 8 MVC + Web API
- **Database:** SQL Server `PMSDB` (LocalDB or full SQL Server)

The ASP.NET app serves the PMS static files and exposes REST API at `/api/*`.  
All data flows through Entity Framework Core — no localStorage demo data.

## Setup

### 1. Create the database

**Option A — EF auto-create (development):**  
Start the app; `DbInitializer` runs `EnsureCreated` and seeds demo users.

**Option B — Manual script:**  
Run `PMSDB_SqlServer.sql` in SQL Server Management Studio.

### 2. Connection string

Edit `ParoleManagementSystem/appsettings.json`:

```json
"ConnectionStrings": {
  "DefaultConnection": "Server=(localdb)\\mssqllocaldb;Database=PMSDB;Trusted_Connection=True;MultipleActiveResultSets=true"
}
```

### 3. Run the application

```powershell
cd ..\ParoleManagementSystem\ParoleManagementSystem
dotnet run
```

Open the URL shown in the console (typically `https://localhost:7110`).

### 4. Login credentials (seeded)

| Role | Username | Password |
|------|----------|----------|
| System Administrator | admin | admin123 |
| CS Parole Clerk | pngcs.clerk | clerk123 |
| DJAG Parole Clerk | djag.clerk | clerk123 |
| Jail Commander | commander | cmd123 |
| Board Chairperson | board.chair | board123 |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Authenticate |
| GET | /api/auth/me | Current session |
| POST | /api/auth/logout | Sign out |
| GET/POST | /api/users | User CRUD |
| GET/POST | /api/institutions | Institution CRUD |
| GET/POST | /api/prisoners | Prisoner CRUD |
| GET/POST | /api/applications | Application CRUD |
| POST | /api/applications/{id}/forms/{formKey} | Save form data |
| POST | /api/applications/{id}/submit | Submit to DJAG |
| POST | /api/applications/{id}/transition | Workflow status change |
| POST | /api/applications/{id}/decision | Board decision |
| GET/POST | /api/hearings | Hearing CRUD |
| GET | /api/notifications | User notifications |
| GET | /api/audit-logs | Audit trail |
| GET | /api/dashboard/stats | Dashboard statistics |

## Schema corrections (PMSDB.sql → PMSDB_SqlServer.sql)

| Issue in original PMSDB.sql | Fix |
|-----------------------------|-----|
| MySQL syntax (`AUTO_INCREMENT`, `ENUM`) | Converted to T-SQL `IDENTITY`, `NVARCHAR` |
| Missing AuditLog, Notification tables | Added for PMS workflow |
| Missing ApplicationFormData | Added for Forms 1–5 JSON storage |
| No Users profile fields | Added FirstName, LastName, Email, InstitutionID, BoardPosition |
| Application status enum too narrow | Extended to full workflow statuses |
