-- PMS MySQL schema for WampServer / MySQL Workbench
-- Run this script in MySQL Workbench against your local server.

CREATE DATABASE IF NOT EXISTS pms_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pms_db;

CREATE TABLE IF NOT EXISTS prisoners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prisoner_number VARCHAR(20) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(20) NULL,
  institution_id VARCHAR(32) NOT NULL,
  offense VARCHAR(255) NULL,
  sentence_start_date DATE NOT NULL,
  sentence_end_date DATE NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Awaiting Eligibility',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prisoners_institution (institution_id),
  INDEX idx_prisoners_status (status),
  INDEX idx_prisoners_name (last_name, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
