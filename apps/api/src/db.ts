import mysql, { type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import {migrateTasksAndBilling} from './migrations.js';
export const pool=mysql.createPool({host:process.env.DB_HOST??'127.0.0.1',port:Number(process.env.DB_PORT??3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME??'homework_assistant',connectionLimit:4,charset:'utf8mb4',timezone:'Z',dateStrings:true});
type Executor=typeof pool|PoolConnection;
export async function rows<T=Record<string,any>>(sql:string,values:any[]=[],db:Executor=pool):Promise<T[]> { const [r]=await db.execute<RowDataPacket[]>(sql,values); return r as T[]; }
export async function run(sql:string,values:any[]=[],db:Executor=pool) { const [r]=await db.execute<ResultSetHeader>(sql,values);return r; }
export async function transaction<T>(fn:(db:PoolConnection)=>Promise<T>) {const db=await pool.getConnection();try {await db.beginTransaction();const result=await fn(db);await db.commit();return result;}catch(e){await db.rollback();throw e;}finally{db.release();}}
export async function migrate() {
 const db=await pool.getConnection();
 try {
  const [lock]=await rows('SELECT GET_LOCK(?,30) AS acquired',[`${process.env.DB_NAME??'homework_assistant'}:migrate`],db);if(Number(lock.acquired)!==1)throw new Error('Migration lock unavailable');
  const tables=[
   `CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
   `CREATE TABLE IF NOT EXISTS families (id VARCHAR(36) PRIMARY KEY, name VARCHAR(80) NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS children (id VARCHAR(36) PRIMARY KEY,family_id VARCHAR(36) NOT NULL,name VARCHAR(40) NOT NULL,grade VARCHAR(40) NOT NULL DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(family_id))`,
   `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY,family_id VARCHAR(36) NOT NULL,role VARCHAR(10) NOT NULL,child_id VARCHAR(36),expires_at DATETIME NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
   `CREATE TABLE IF NOT EXISTS pairing_codes (code_hash CHAR(64) PRIMARY KEY,family_id VARCHAR(36) NOT NULL,child_id VARCHAR(36),expires_at DATETIME NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS imports (id VARCHAR(36) PRIMARY KEY,family_id VARCHAR(36) NOT NULL,child_ids JSON NOT NULL,work_date DATE NOT NULL,source_text MEDIUMTEXT NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'queued',result JSON,error VARCHAR(500),version INT NOT NULL DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(family_id),INDEX(status,created_at))`,
   `CREATE TABLE IF NOT EXISTS attachments (id VARCHAR(36) PRIMARY KEY,import_id VARCHAR(36) NOT NULL,family_id VARCHAR(36) NOT NULL,name VARCHAR(255) NOT NULL,mime VARCHAR(80) NOT NULL,path VARCHAR(255) NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS assignments (id VARCHAR(36) PRIMARY KEY,family_id VARCHAR(36) NOT NULL,child_id VARCHAR(36) NOT NULL,import_id VARCHAR(36) NOT NULL,work_date DATE NOT NULL,subject VARCHAR(30) NOT NULL,content TEXT NOT NULL,due_date DATE,materials VARCHAR(500) NOT NULL DEFAULT '',completed BOOLEAN NOT NULL DEFAULT FALSE,revision INT NOT NULL DEFAULT 1,updated BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(family_id,child_id,work_date))`
  ];
  for(const sql of tables) await run(sql,[],db);
  await run('INSERT IGNORE INTO schema_migrations(version) VALUES(1)',[],db);
  await migrateTasksAndBilling(db);
  await run("INSERT IGNORE INTO families(id,name) VALUES('family','我的家庭')",[],db);
 } finally {await db.query('SELECT RELEASE_LOCK(?)',[`${process.env.DB_NAME??'homework_assistant'}:migrate`]);db.release();}
}
