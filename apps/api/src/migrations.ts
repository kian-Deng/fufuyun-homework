import type {PoolConnection} from 'mysql2/promise';
import {rows,run} from './db.js';

// MySQL DDL auto-commits. Inspect each column so an interrupted migration can resume.
export async function migrateTasksAndBilling(db:PoolConnection) {
  const [done]=await rows('SELECT version FROM schema_migrations WHERE version=2',[],db);
  if(done)return;
  const [legacyColumn]=await rows('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['imports','ai_legacy_unknown'],db);
  if(!legacyColumn)await run('ALTER TABLE imports ADD COLUMN ai_legacy_unknown BOOLEAN NOT NULL DEFAULT FALSE',[],db);
  // Earlier versions did not record usage. Never pretend their previous calls were free.
  await run('UPDATE imports SET ai_legacy_unknown=TRUE',[],db);
  for(const [name,definition] of [
    ['priority',"VARCHAR(10) NOT NULL DEFAULT 'normal'"],
    ['priority_reason',"VARCHAR(200) NOT NULL DEFAULT ''"],
    ['completed_at','DATETIME NULL']
  ]){
    const [column]=await rows('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['assignments',name],db);
    if(!column)await run(`ALTER TABLE assignments ADD COLUMN ${name} ${definition}`,[],db);
  }
  await run(`CREATE TABLE IF NOT EXISTS ai_attempts (
    id VARCHAR(36) PRIMARY KEY, import_id VARCHAR(36) NOT NULL, family_id VARCHAR(36) NOT NULL,
    model VARCHAR(100) NOT NULL, price_snapshot JSON NOT NULL, estimated_input INT NOT NULL,
    reserved_micros BIGINT NOT NULL, charged_micros BIGINT, state VARCHAR(16) NOT NULL,
    usage_json JSON, error VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX(import_id), INDEX(family_id)
  )`,[],db);
  // Preserve legacy completion flags, without fabricating completion dates or reanalysing.
  await run('INSERT IGNORE INTO schema_migrations(version) VALUES(2)',[],db);
}

export async function migrateFamilyLinksAndManual(db:PoolConnection){
  const [done]=await rows('SELECT version FROM schema_migrations WHERE version=3',[],db);
  if(done)return;
  await run(`CREATE TABLE IF NOT EXISTS family_links (family_id VARCHAR(36) PRIMARY KEY,id VARCHAR(36) NOT NULL UNIQUE,token_hash CHAR(64) NOT NULL UNIQUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,[],db);
  const [column]=await rows('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['imports','import_kind'],db);
  if(!column)await run("ALTER TABLE imports ADD COLUMN import_kind VARCHAR(10) NOT NULL DEFAULT 'ai'",[],db);
  await run('INSERT IGNORE INTO schema_migrations(version) VALUES(3)',[],db);
}

export async function migrateHouseholdTasks(db:PoolConnection){
  const [done]=await rows('SELECT version FROM schema_migrations WHERE version=4',[],db);if(done)return;
  await run(`CREATE TABLE IF NOT EXISTS household_tasks (id VARCHAR(36) PRIMARY KEY,family_id VARCHAR(36) NOT NULL,content TEXT NOT NULL,priority VARCHAR(10) NOT NULL DEFAULT 'normal',revision INT NOT NULL DEFAULT 1,archived BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(family_id))`,[],db);
  const [column]=await rows('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['assignments','household_task_id'],db);
  if(!column)await run('ALTER TABLE assignments ADD COLUMN household_task_id VARCHAR(36) NULL',[],db);
  const [index]=await rows('SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',['assignments','household_task_day'],db);
  if(!index)await run('CREATE UNIQUE INDEX household_task_day ON assignments(household_task_id,child_id,work_date)',[],db);
  await run('INSERT IGNORE INTO schema_migrations(version) VALUES(4)',[],db);
}

export async function migrateHouseholdPublications(db:PoolConnection){
  const [done]=await rows('SELECT version FROM schema_migrations WHERE version=5',[],db);if(done)return;
  const [column]=await rows('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['imports','allocation_rule'],db);
  if(!column)await run('ALTER TABLE imports ADD COLUMN allocation_rule JSON NULL',[],db);
  await run('INSERT IGNORE INTO schema_migrations(version) VALUES(5)',[],db);
}
