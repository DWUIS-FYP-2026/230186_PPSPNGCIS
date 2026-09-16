
-- 2. Create Tables
CREATE TABLE Users (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Role ENUM('Admin', 'CS Parole Clerk', 'DJAG Parole Clerk', 'Secretariat', 'Jail Commander', 'Board Member') NOT NULL,
    IsActive BOOLEAN DEFAULT TRUE
);

CREATE TABLE CorrectionalInstitution (
    InstitutionID INT AUTO_INCREMENT PRIMARY KEY,
    InstitutionName VARCHAR(100) NOT NULL,
    Province VARCHAR(100),
    Address VARCHAR(255)
);

CREATE TABLE Officer (
    OfficerID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT UNIQUE NULL,
    FirstName VARCHAR(50) NOT NULL,
    LastName VARCHAR(50) NOT NULL,
    Gender VARCHAR(10),
    DOB DATE,
    Specialization ENUM(
        'CS Parole Clerk', 
        'DJAG Parole Clerk', 
        'Secretariat', 
        'Jail Commander', 
        'Board Member'
    ) NOT NULL,
    InstitutionID INT NOT NULL,
    FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE SET NULL,
    FOREIGN KEY (InstitutionID) REFERENCES CorrectionalInstitution(InstitutionID) ON DELETE RESTRICT
);

CREATE TABLE Prisoner (
    PrisonerID INT AUTO_INCREMENT PRIMARY KEY,
    InstitutionID INT NOT NULL,
    FirstName VARCHAR(50) NOT NULL,
    LastName VARCHAR(50) NOT NULL,
    DOB DATE,
    Gender VARCHAR(10),
    Nationality VARCHAR(50),
    SSD DATE,
    SED DATE,
    EligibilityDate DATE,
    FOREIGN KEY (InstitutionID) REFERENCES CorrectionalInstitution(InstitutionID) ON DELETE RESTRICT
);

CREATE TABLE Offence (
    OffenceID INT AUTO_INCREMENT PRIMARY KEY,
    PrisonerID INT NOT NULL,
    OffenceTitle VARCHAR(150) NOT NULL,
    CourtName VARCHAR(100),
    FOREIGN KEY (PrisonerID) REFERENCES Prisoner(PrisonerID) ON DELETE CASCADE
);

CREATE TABLE Guarantor (
    GuarantorID INT AUTO_INCREMENT PRIMARY KEY,
    PrisonerID INT NOT NULL,
    FirstName VARCHAR(50) NOT NULL,
    LastName VARCHAR(50) NOT NULL,
    Contact VARCHAR(50),
    Relationship VARCHAR(50),
    FOREIGN KEY (PrisonerID) REFERENCES Prisoner(PrisonerID) ON DELETE CASCADE
);

CREATE TABLE ParoleApplication (
    ApplicationID INT AUTO_INCREMENT PRIMARY KEY,
    PrisonerID INT NOT NULL,
    ApplicationNumber VARCHAR(30) UNIQUE NOT NULL,
    SubmissionDate DATE NOT NULL,
    Status ENUM('Submitted', 'Dossier Compiling', 'Under Board Review', 'Approved', 'Deferred', 'Refused') DEFAULT 'Submitted',
    DossierCompleteFlag BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (PrisonerID) REFERENCES Prisoner(PrisonerID) ON DELETE CASCADE
);

CREATE TABLE Report (
    ReportID INT AUTO_INCREMENT PRIMARY KEY,
    ApplicationID INT NOT NULL,
    OfficerID INT NOT NULL,
    ReportType ENUM('Community Progress', 'Behavioral', 'Medical', 'Guarantor Check') NOT NULL,
    ReportDate DATE NOT NULL,
    Findings TEXT,
    Recommendation ENUM('Recommended', 'Not Recommended'),
    FOREIGN KEY (ApplicationID) REFERENCES ParoleApplication(ApplicationID) ON DELETE CASCADE,
    FOREIGN KEY (OfficerID) REFERENCES Officer(OfficerID) ON DELETE RESTRICT
);

CREATE TABLE Hearing (
    HearingID INT AUTO_INCREMENT PRIMARY KEY,
    ApplicationID INT NOT NULL,
    SecretariatOfficerID INT NOT NULL,
    HearingDate DATETIME NOT NULL,
    Venue VARCHAR(100),
    Outcome ENUM('Approved', 'Refused', 'Deferred', 'Adjourned'),
    SecretariatNote TEXT,
    FOREIGN KEY (ApplicationID) REFERENCES ParoleApplication(ApplicationID) ON DELETE CASCADE,
    FOREIGN KEY (SecretariatOfficerID) REFERENCES Officer(OfficerID) ON DELETE RESTRICT
);

CREATE TABLE HearingPanel (
    HearingID INT NOT NULL,
    OfficerID INT NOT NULL,
    PanelRole ENUM('Chairperson', 'CS Representative', 'Medical Member') NOT NULL,
    Vote ENUM('Approve', 'Refuse', 'Defer'),
    PRIMARY KEY (HearingID, OfficerID),
    FOREIGN KEY (HearingID) REFERENCES Hearing(HearingID) ON DELETE CASCADE,
    FOREIGN KEY (OfficerID) REFERENCES Officer(OfficerID) ON DELETE RESTRICT
);

-- Inspect Database Structure
SHOW TABLES;
DESCRIBE Officer;

-- 3. Seed Initial Data
INSERT INTO Users (UserID, Username, PasswordHash, Role, IsActive) VALUES
(1, 'j.dole@cs.gov.pg', 'Password123!', 'CS Parole Clerk', TRUE),
(2, 'm.kila@djag.gov.pg', 'Password123!', 'DJAG Parole Clerk', TRUE),
(3, 'h.morris@djag.gov.pg', 'Password123!', 'DJAG Secretary', TRUE);

INSERT INTO CorrectionalInstitution (InstitutionID, InstitutionName, Province, Address) VALUES
(1, 'Bomana Correctional Centre', 'National Capital District', 'P.O. Box 123, Boroko, NCD'),
(2, 'Baisu Correctional Centre', 'Western Highlands Province', 'P.O. Box 45, Mount Hagen'),
(3, 'Buimo Correctional Centre', 'Morobe Province', 'P.O. Box 89, Lae');

INSERT INTO Officer (OfficerID, UserID, FirstName, LastName, Gender, DOB, Specialization, InstitutionID) VALUES
(101, 1, 'John', 'Dole', 'Male', '1985-06-12', 'CS Parole Clerk', 1),
(102, 2, 'Mary', 'Kila', 'Female', '1990-03-22', 'DJAG Parole Clerk', 1),
(103, 3, 'Francis', 'Kakaraya', 'Male', '1975-11-05', 'Board Member', 1);

INSERT INTO Prisoner (PrisonerID, InstitutionID, FirstName, LastName, DOB, Gender, Nationality, SSD, SED, EligibilityDate) VALUES
(1001, 1, 'Paul', 'Kaupa', '1992-04-10', 'Male', 'Papua New Guinean', '2020-01-15', '2030-01-15', '2025-01-15'),
(1002, 1, 'Peter', 'Wama', '1988-09-18', 'Male', 'Papua New Guinean', '2019-06-01', '2027-06-01', '2023-06-01'),
(1003, 2, 'Sarah', 'Tekate', '1995-12-01', 'Female', 'Papua New Guinean', '2022-03-10', '2028-03-10', '2025-03-10');

INSERT INTO Offence (OffenceID, PrisonerID, OffenceTitle, CourtName) VALUES
(1, 1001, 'Armed Robbery', 'Waigani National Court'),
(2, 1002, 'Unlawful Wounding', 'Mount Hagen National Court'),
(3, 1003, 'Grand Larceny', 'Lae National Court');

INSERT INTO Guarantor (GuarantorID, PrisonerID, FirstName, LastName, Contact, Relationship) VALUES
(1, 1001, 'Samuel', 'Kaupa', '+675 7123 4567', 'Father'),
(2, 1002, 'Grace', 'Wama', '+675 7234 5678', 'Wife'),
(3, 1003, 'David', 'Tekate', '+675 7345 6789', 'Brother');

INSERT INTO ParoleApplication (ApplicationID, PrisonerID, ApplicationNumber, SubmissionDate, Status, DossierCompleteFlag) VALUES
(501, 1001, 'PA-2026-001', '2026-02-10', 'Under Board Review', TRUE),
(502, 1002, 'PA-2026-002', '2026-03-15', 'Dossier Compiling', FALSE),
(503, 1003, 'PA-2026-003', '2026-05-01', 'Approved', TRUE);

INSERT INTO Report (ReportID, ApplicationID, OfficerID, ReportType, ReportDate, Findings, Recommendation) VALUES
(201, 501, 101, 'Behavioral', '2026-02-20', 'Inmate showed exemplary discipline during incarceration.', 'Recommended'),
(202, 501, 102, 'Community Progress', '2026-03-01', 'Local village elders accepted victim rehabilitation settlement.', 'Recommended'),
(203, 502, 101, 'Behavioral', '2026-03-25', 'Inmate engaged in vocational carpentry training with good progress.', 'Recommended');

INSERT INTO Hearing (HearingID, ApplicationID, SecretariatOfficerID, HearingDate, Venue, Outcome, SecretariatNote) VALUES
(301, 501, 102, '2026-06-15 10:00:00', 'Bomana Conference Room', 'Approved', 'Board unanimously approved release subject to community supervision.'),
(302, 502, 102, '2026-07-20 11:30:00', 'Bomana Conference Room', 'Deferred', 'Deferred pending updated guarantor housing verification.'),
(303, 503, 102, '2026-05-18 09:00:00', 'DJAG HQ Boardroom', 'Approved', 'Parole order signed and forwarded to CS Commissioner.');

INSERT INTO HearingPanel (HearingID, OfficerID, PanelRole, Vote) VALUES
(301, 103, 'Chairperson', 'Approve'),
(302, 103, 'Chairperson', 'Defer'),
(303, 103, 'Chairperson', 'Approve');

-- Verify Query
SELECT * FROM Users;