-- PMSDB — SQL Server schema for Parole Management System
-- Run on SQL Server / LocalDB before starting the ASP.NET application

IF DB_ID(N'PMSDB') IS NULL
    CREATE DATABASE PMSDB;
GO

USE PMSDB;
GO

-- Drop existing objects (development reset)
IF OBJECT_ID(N'dbo.HearingPanel', N'U') IS NOT NULL DROP TABLE dbo.HearingPanel;
IF OBJECT_ID(N'dbo.Hearing', N'U') IS NOT NULL DROP TABLE dbo.Hearing;
IF OBJECT_ID(N'dbo.Report', N'U') IS NOT NULL DROP TABLE dbo.Report;
IF OBJECT_ID(N'dbo.ApplicationFormData', N'U') IS NOT NULL DROP TABLE dbo.ApplicationFormData;
IF OBJECT_ID(N'dbo.ParoleApplication', N'U') IS NOT NULL DROP TABLE dbo.ParoleApplication;
IF OBJECT_ID(N'dbo.Guarantor', N'U') IS NOT NULL DROP TABLE dbo.Guarantor;
IF OBJECT_ID(N'dbo.Offence', N'U') IS NOT NULL DROP TABLE dbo.Offence;
IF OBJECT_ID(N'dbo.Notification', N'U') IS NOT NULL DROP TABLE dbo.Notification;
IF OBJECT_ID(N'dbo.AuditLog', N'U') IS NOT NULL DROP TABLE dbo.AuditLog;
IF OBJECT_ID(N'dbo.Prisoner', N'U') IS NOT NULL DROP TABLE dbo.Prisoner;
IF OBJECT_ID(N'dbo.Officer', N'U') IS NOT NULL DROP TABLE dbo.Officer;
IF OBJECT_ID(N'dbo.Users', N'U') IS NOT NULL DROP TABLE dbo.Users;
IF OBJECT_ID(N'dbo.CorrectionalInstitution', N'U') IS NOT NULL DROP TABLE dbo.CorrectionalInstitution;
IF OBJECT_ID(N'dbo.SystemSettings', N'U') IS NOT NULL DROP TABLE dbo.SystemSettings;
GO

CREATE TABLE CorrectionalInstitution (
    InstitutionID   INT IDENTITY(1,1) PRIMARY KEY,
    InstitutionName NVARCHAR(100) NOT NULL,
    Code            NVARCHAR(20)  NULL,
    Province        NVARCHAR(100) NULL,
    Address         NVARCHAR(255) NULL,
    Capacity        INT           NULL,
    Phone           NVARCHAR(30)  NULL,
    Email           NVARCHAR(100) NULL,
    Status          NVARCHAR(20)  NOT NULL DEFAULT N'Active'
);

CREATE TABLE Users (
    UserID          INT IDENTITY(1,1) PRIMARY KEY,
    Username        NVARCHAR(50)  NOT NULL UNIQUE,
    Email           NVARCHAR(100) NULL,
    PasswordHash    NVARCHAR(255) NOT NULL,
    FirstName       NVARCHAR(50)  NOT NULL,
    LastName        NVARCHAR(50)  NOT NULL,
    Role            NVARCHAR(50)  NOT NULL,
    BoardPosition   NVARCHAR(50)  NULL,
    Position        NVARCHAR(100) NULL,
    Phone           NVARCHAR(30)  NULL,
    InstitutionID   INT           NULL,
    IsActive        BIT           NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2     NULL,
    CONSTRAINT FK_Users_Institution FOREIGN KEY (InstitutionID)
        REFERENCES CorrectionalInstitution(InstitutionID) ON DELETE SET NULL
);

CREATE TABLE Officer (
    OfficerID       INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT           NULL UNIQUE,
    FirstName       NVARCHAR(50)  NOT NULL,
    LastName        NVARCHAR(50)  NOT NULL,
    Gender          NVARCHAR(10)  NULL,
    DOB             DATE          NULL,
    Specialization  NVARCHAR(50)  NOT NULL,
    InstitutionID   INT           NOT NULL,
    CONSTRAINT FK_Officer_User FOREIGN KEY (UserID)
        REFERENCES Users(UserID) ON DELETE SET NULL,
    CONSTRAINT FK_Officer_Institution FOREIGN KEY (InstitutionID)
        REFERENCES CorrectionalInstitution(InstitutionID) ON DELETE NO ACTION
);

CREATE TABLE Prisoner (
    PrisonerID      INT IDENTITY(1,1) PRIMARY KEY,
    InstitutionID   INT           NOT NULL,
    PrisonerNumber  NVARCHAR(30)  NOT NULL UNIQUE,
    FirstName       NVARCHAR(50)  NOT NULL,
    LastName        NVARCHAR(50)  NOT NULL,
    DOB             DATE          NULL,
    Gender          NVARCHAR(10)  NULL,
    Nationality     NVARCHAR(50)  NULL,
    SSD             DATE          NULL,
    SED             DATE          NULL,
    EligibilityDate DATE          NULL,
    Offense         NVARCHAR(150) NULL,
    Status          NVARCHAR(50)  NOT NULL DEFAULT N'In Custody',
    CreatedAt       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2     NULL,
    CONSTRAINT FK_Prisoner_Institution FOREIGN KEY (InstitutionID)
        REFERENCES CorrectionalInstitution(InstitutionID) ON DELETE NO ACTION
);

CREATE TABLE Offence (
    OffenceID       INT IDENTITY(1,1) PRIMARY KEY,
    PrisonerID      INT           NOT NULL,
    OffenceTitle    NVARCHAR(150) NOT NULL,
    CourtName       NVARCHAR(100) NULL,
    CONSTRAINT FK_Offence_Prisoner FOREIGN KEY (PrisonerID)
        REFERENCES Prisoner(PrisonerID) ON DELETE CASCADE
);

CREATE TABLE Guarantor (
    GuarantorID     INT IDENTITY(1,1) PRIMARY KEY,
    PrisonerID      INT           NOT NULL,
    FirstName       NVARCHAR(50)  NOT NULL,
    LastName        NVARCHAR(50)  NOT NULL,
    Contact         NVARCHAR(50)  NULL,
    Relationship    NVARCHAR(50)  NULL,
    CONSTRAINT FK_Guarantor_Prisoner FOREIGN KEY (PrisonerID)
        REFERENCES Prisoner(PrisonerID) ON DELETE CASCADE
);

CREATE TABLE ParoleApplication (
    ApplicationID       INT IDENTITY(1,1) PRIMARY KEY,
    PrisonerID          INT           NOT NULL,
    InstitutionID       INT           NOT NULL,
    ApplicationNumber   NVARCHAR(30)  NOT NULL UNIQUE,
    SubmissionDate      DATE          NULL,
    Status              NVARCHAR(50)  NOT NULL DEFAULT N'Draft',
    DossierCompleteFlag BIT           NOT NULL DEFAULT 0,
    SubmittedByUserID   INT           NULL,
    PreParoleReport     NVARCHAR(MAX) NULL,
    HearingDate         DATE          NULL,
    BoardOutcome        NVARCHAR(20)  NULL,
    BoardConditions     NVARCHAR(MAX) NULL,
    BoardDeliberation   NVARCHAR(MAX) NULL,
    BoardDecidedBy      INT           NULL,
    BoardDecidedAt      DATETIME2     NULL,
    CreatedAt           DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2     NULL,
    CONSTRAINT FK_Application_Prisoner FOREIGN KEY (PrisonerID)
        REFERENCES Prisoner(PrisonerID) ON DELETE CASCADE,
    CONSTRAINT FK_Application_Institution FOREIGN KEY (InstitutionID)
        REFERENCES CorrectionalInstitution(InstitutionID) ON DELETE NO ACTION,
    CONSTRAINT FK_Application_SubmittedBy FOREIGN KEY (SubmittedByUserID)
        REFERENCES Users(UserID) ON DELETE SET NULL,
    CONSTRAINT FK_Application_BoardDecidedBy FOREIGN KEY (BoardDecidedBy)
        REFERENCES Users(UserID) ON DELETE NO ACTION
);

CREATE TABLE ApplicationFormData (
    FormDataID      INT IDENTITY(1,1) PRIMARY KEY,
    ApplicationID   INT           NOT NULL,
    FormNumber      INT           NOT NULL,
    JsonData        NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
    SavedByUserID   INT           NULL,
    SavedAt         DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FormData_Application FOREIGN KEY (ApplicationID)
        REFERENCES ParoleApplication(ApplicationID) ON DELETE CASCADE,
    CONSTRAINT FK_FormData_SavedBy FOREIGN KEY (SavedByUserID)
        REFERENCES Users(UserID) ON DELETE SET NULL,
    CONSTRAINT UQ_FormData_AppForm UNIQUE (ApplicationID, FormNumber)
);

CREATE TABLE Report (
    ReportID        INT IDENTITY(1,1) PRIMARY KEY,
    ApplicationID   INT           NOT NULL,
    OfficerID       INT           NOT NULL,
    ReportType      NVARCHAR(50)  NOT NULL,
    ReportDate      DATE          NOT NULL,
    Findings        NVARCHAR(MAX) NULL,
    Recommendation  NVARCHAR(30)  NULL,
    CONSTRAINT FK_Report_Application FOREIGN KEY (ApplicationID)
        REFERENCES ParoleApplication(ApplicationID) ON DELETE CASCADE,
    CONSTRAINT FK_Report_Officer FOREIGN KEY (OfficerID)
        REFERENCES Officer(OfficerID) ON DELETE NO ACTION
);

CREATE TABLE Hearing (
    HearingID           INT IDENTITY(1,1) PRIMARY KEY,
    ApplicationID       INT           NOT NULL,
    SecretariatOfficerID INT          NULL,
    HearingDate         DATETIME2     NOT NULL,
    Venue               NVARCHAR(100) NULL,
    Status              NVARCHAR(20)  NOT NULL DEFAULT N'Scheduled',
    Outcome             NVARCHAR(20)  NULL,
    SecretariatNote     NVARCHAR(MAX) NULL,
    CreatedAt           DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Hearing_Application FOREIGN KEY (ApplicationID)
        REFERENCES ParoleApplication(ApplicationID) ON DELETE CASCADE,
    CONSTRAINT FK_Hearing_Officer FOREIGN KEY (SecretariatOfficerID)
        REFERENCES Officer(OfficerID) ON DELETE SET NULL
);

CREATE TABLE HearingPanel (
    HearingID       INT           NOT NULL,
    OfficerID       INT           NOT NULL,
    PanelRole       NVARCHAR(30)  NOT NULL,
    Vote            NVARCHAR(20)  NULL,
    PRIMARY KEY (HearingID, OfficerID),
    CONSTRAINT FK_Panel_Hearing FOREIGN KEY (HearingID)
        REFERENCES Hearing(HearingID) ON DELETE CASCADE,
    CONSTRAINT FK_Panel_Officer FOREIGN KEY (OfficerID)
        REFERENCES Officer(OfficerID) ON DELETE NO ACTION
);

CREATE TABLE Notification (
    NotificationID      INT IDENTITY(1,1) PRIMARY KEY,
    Type                NVARCHAR(50)  NOT NULL,
    Title               NVARCHAR(200) NOT NULL,
    Message             NVARCHAR(MAX) NOT NULL,
    RecipientRole       NVARCHAR(50)  NULL,
    RecipientUserID     INT           NULL,
    InstitutionID       INT           NULL,
    PrisonerID          INT           NULL,
    ApplicationID       INT           NULL,
    IsRead              BIT           NOT NULL DEFAULT 0,
    IsResolved          BIT           NOT NULL DEFAULT 0,
    CreatedAt           DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Notification_User FOREIGN KEY (RecipientUserID)
        REFERENCES Users(UserID) ON DELETE SET NULL,
    CONSTRAINT FK_Notification_Institution FOREIGN KEY (InstitutionID)
        REFERENCES CorrectionalInstitution(InstitutionID) ON DELETE SET NULL,
    CONSTRAINT FK_Notification_Prisoner FOREIGN KEY (PrisonerID)
        REFERENCES Prisoner(PrisonerID) ON DELETE SET NULL,
    CONSTRAINT FK_Notification_Application FOREIGN KEY (ApplicationID)
        REFERENCES ParoleApplication(ApplicationID) ON DELETE SET NULL
);

CREATE TABLE AuditLog (
    AuditLogID      INT IDENTITY(1,1) PRIMARY KEY,
    UserID          INT           NULL,
    UserName        NVARCHAR(100) NULL,
    Role            NVARCHAR(50)  NULL,
    Action          NVARCHAR(50)  NOT NULL,
    Entity          NVARCHAR(50)  NOT NULL,
    EntityID        NVARCHAR(50)  NULL,
    Details         NVARCHAR(MAX) NULL,
    Timestamp       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE SystemSettings (
    SettingKey      NVARCHAR(50)  PRIMARY KEY,
    SettingValue    NVARCHAR(MAX) NOT NULL
);

CREATE INDEX IX_Prisoner_Institution ON Prisoner(InstitutionID);
CREATE INDEX IX_Application_Status ON ParoleApplication(Status);
CREATE INDEX IX_Application_Prisoner ON ParoleApplication(PrisonerID);
CREATE INDEX IX_Notification_Recipient ON Notification(RecipientRole, RecipientUserID);
CREATE INDEX IX_AuditLog_Timestamp ON AuditLog(Timestamp DESC);
GO
