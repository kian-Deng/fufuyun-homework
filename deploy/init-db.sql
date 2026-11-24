-- Run using an administrator of the EXISTING MySQL server.
-- Replace the password below before executing. Never run against an unrelated schema.
CREATE DATABASE IF NOT EXISTS homework_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'homework_assistant'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_UNIQUE_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON homework_assistant.* TO 'homework_assistant'@'%';
