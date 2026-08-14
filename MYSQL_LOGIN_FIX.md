# MySQL PMSDB — Login Fix Guide

## Root Cause Summary

Login was failing because the backend was configured for **SQL Server LocalDB**, but your database was created in **MySQL Workbench**. The application never reached your `Users` table.

## Issues Found and Fixed

| # | Issue | Why login failed | Fix applied |
|---|--------|------------------|-------------|
| 1 | **Wrong database provider** | `UseSqlServer()` in Program.cs | Switched to `UseMySql()` (Pomelo) |
| 2 | **Wrong connection string** | Pointed to `(localdb)\mssqllocaldb` | MySQL format: `Server=localhost;Port=3306;Database=PMSDB;User=root;Password=...` |
| 3 | **Schema mismatch** | App expected columns not in MySQL `Users` table | `AppUser` mapped to `UserID, Username, PasswordHash, Role, IsActive` only |
| 4 | **Wrong login field** | Auth queried `Email` column (does not exist) | Query `Username` only (seed uses email as username) |
| 5 | **Invalid seed passwords** | PMSDB.sql bcrypt hashes are placeholders | Run `PMSDB_MySQL_SetPasswords.sql` |
| 6 | **Role name mismatch** | MySQL: `CS Parole Clerk` vs frontend: `PNGCS Parole Clerk` | `AuthHelper.MapDbRoleToFrontend()` |
| 7 | **EnsureCreated** | Could conflict with existing MySQL schema | Removed; connection test only |
| 8 | **Generic errors** | "Sign In Failed" with no detail | API returns specific MySQL/auth messages |

## Setup Steps

### 1. Connection string (root, no password)

The app is configured for **root with no MySQL password** in `appsettings.Development.json`:

```json
"ConnectionStrings": {
  "DefaultConnection": "Server=localhost;Port=3306;Database=PMSDB;User=root;Password=;TreatTinyAsBoolean=true;"
}
```

Leave `Password=` empty. Only change this if you add a MySQL password later.

### 2. Set known passwords in MySQL

Run in MySQL Workbench:

```sql
SOURCE PMS/PMSDB_MySQL_SetPasswords.sql;
```

### 3. Restore packages and run

```powershell
cd ParoleManagementSystem\ParoleManagementSystem
dotnet restore
dotnet run
```

Open the URL shown (e.g. `https://localhost:7110`).

### 4. Test login

| Username | Password | Dashboard |
|----------|----------|-----------|
| john.dole@cs.gov.pg | Password123! | PNGCS Parole Clerk |
| mary.kila@djag.gov.pg | Password123! | DJAG Parole Clerk |
| judge.kakaraya@justice.gov.pg | Password123! | Parole Board |

**Important:** Use the full **Username** from the `Users` table, not a short name like `admin`.

## Verify MySQL connection manually

```sql
USE PMSDB;
SELECT UserID, Username, Role, IsActive FROM Users;
```

## If login still fails

1. Check console for `Connected to MySQL PMSDB successfully`
2. Confirm MySQL service is running (port 3306)
3. Confirm you ran `PMSDB_MySQL_SetPasswords.sql`
4. Run the app via `dotnet run` — do not open HTML files directly
