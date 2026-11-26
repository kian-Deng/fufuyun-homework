import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {buildApp} from '../src/app.js';
import {migrate,pool,run,rows} from '../src/db.js';
import {reserveAttempt,settleAttempt,billingSummary} from '../src/billing.js';
import {recoverInterrupted} from '../src/worker.js';
import {priceFor,reserveCost} from '../src/budget.js';
const enabled=process.env.RUN_MYSQL_TESTS==='1';
test('MySQL integration: publication, dedicated-device isolation, revisions, pairing and withdrawal',{skip:!enabled},async()=>{
 if(!process.env.DB_NAME?.endsWith('_test'))throw new Error('Integration tests require an isolated DB_NAME ending in _test');
 const app=buildApp();const family=randomUUID(),a=randomUUID(),b=randomUUID(),iid=randomUUID(),attachment=randomUUID();
 const parent=randomBytes(32).toString('hex'),child=randomBytes(32).toString('hex');const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 const request=(url:string,method:any='GET',payload?:any,token=parent)=>app.inject({url,method,payload,headers:{Authorization:`Bearer ${token}`}});
 try{
  await migrate();await run('INSERT INTO families(id,name) VALUES(?,?)',[family,'测试家庭']);
  for(const [cid,name] of [[a,'孩子甲'],[b,'孩子乙']])await run('INSERT INTO children(id,family_id,name) VALUES(?,?,?)',[cid,family,name]);
  for(const [token,role,cid] of [[parent,'parent',null],[child,'child',a]])await run('INSERT INTO sessions(token_hash,family_id,role,child_id,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',[hash(token!),family,role,cid]);
  const draft={items:[{subject:'数学',content:'第12页第1题',priority:'high',priorityReason:'明天上交',dueDate:null,materials:'',warning:''}],notices:[]};
  await run("INSERT INTO imports(id,family_id,child_ids,work_date,source_text,status,result) VALUES(?,?,?,'2026-11-24',?,'review',?)",[iid,family,JSON.stringify([a,b]),'测试消息',JSON.stringify(draft)]);
  await run('INSERT INTO attachments(id,import_id,family_id,name,mime,path) VALUES(?,?,?,?,?,?)',[attachment,iid,family,'test.png','image/png','not-a-real-file']);
  assert.equal((await request(`/api/attachments/${attachment}`,'GET',undefined,child)).statusCode,403);
  assert.equal((await request(`/api/assignments?childId=${b}`,'GET',undefined,child)).statusCode,403);
  const list=(await request('/api/children','GET',undefined,child)).json();assert.equal(list.length,1);assert.equal(list[0].id,a);
  const published=await request(`/api/imports/${iid}/publish`,'POST',{version:0});assert.equal(published.statusCode,200,published.body);assert.equal(published.json().count,2);
  assert.equal((await request(`/api/imports/${iid}/publish`,'POST',{version:0})).statusCode,409);
  const [assignment]=(await request(`/api/assignments?childId=${a}`)).json();
  assert.equal(assignment.priority,'high');assert.equal(assignment.priority_reason,'明天上交');
  assert.equal((await request(`/api/assignments?childId=${a}&view=child`,'GET',undefined,child)).json().length,1);
  assert.equal((await request(`/api/assignments/${assignment.id}/complete`,'PUT',{completed:true,revision:1},child)).statusCode,200);
  const [sibling]=(await request(`/api/assignments?childId=${b}`)).json();assert.equal(Number(sibling.completed),0);
  assert.equal((await request(`/api/assignments/${assignment.id}`,'PUT',{...draft.items[0],content:'更新为第13页',revision:1})).statusCode,200);
  const [updated]=(await request(`/api/assignments?childId=${a}`)).json();assert.equal(Number(updated.completed),0);assert.equal(updated.revision,2);assert.equal(Number(updated.updated),1);assert.equal(updated.completed_at,null);
  assert.equal((await request(`/api/assignments/${assignment.id}/complete`,'PUT',{completed:true,revision:1},child)).statusCode,409);
  const pair=await request('/api/pairing','POST',{childId:a});const code=pair.json().code;assert.equal(code.length,12);
  const paired=await request('/api/auth/pair','POST',{code});assert.equal(paired.statusCode,200);assert.equal((await request('/api/auth/pair','POST',{code})).statusCode,400);
  const newToken=paired.json().token;assert.equal((await request(`/api/devices/${hash(newToken)}`,'DELETE')).statusCode,200);assert.equal((await request('/api/me','GET',undefined,newToken)).statusCode,401);
  assert.equal((await request(`/api/imports/${iid}/withdraw`,'POST')).statusCode,200);assert.equal((await request(`/api/assignments?childId=${a}`)).json().length,0);
  assert.equal((await request(`/api/attachments/${attachment}`,'GET',undefined,child)).statusCode,403);
  // Reserve under an import row lock: simultaneous requests must not both generate.
  const billed=randomUUID();await run("INSERT INTO imports(id,family_id,child_ids,work_date,source_text,status) VALUES(?,?,?,'2026-11-26','测试','running')",[billed,family,JSON.stringify([a])]);
  const price=priceFor('kimi-k3.1-pro');const cost=reserveCost(1000,price);
  const concurrent=await Promise.allSettled([reserveAttempt(billed,'kimi-k3.1-pro',price,1000,cost),reserveAttempt(billed,'kimi-k3.1-pro',price,1000,cost)]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
  const first=(concurrent.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<string>).value;
  await settleAttempt(first,{prompt_tokens:1000,completion_tokens:100},price);
  const second=await reserveAttempt(billed,'kimi-k3.1-pro',price,1000,cost);
  await recoverInterrupted();
  const [recovered]=await rows('SELECT status FROM imports WHERE id=?',[billed]);assert.equal(recovered.status,'failed');
  const [unknown]=await rows('SELECT state,charged_micros FROM ai_attempts WHERE id=?',[second]);assert.equal(unknown.state,'unknown');assert.equal(unknown.charged_micros,null);
  const summary=await billingSummary(billed);assert.ok(summary.committedCny>=cost/1e6);assert.equal(summary.attempts.length,2);
  assert.equal((await request(`/api/imports/${billed}/retry`,'POST')).statusCode,409);
  await run("UPDATE imports SET status='running' WHERE id=?",[billed]);await assert.rejects(()=>reserveAttempt(billed,'kimi-k3.1-pro',price,1000,cost),/两次/);
  const exhausted=randomUUID();await run("INSERT INTO imports(id,family_id,child_ids,work_date,source_text,status) VALUES(?,?,?,'2026-11-26','测试','running')",[exhausted,family,JSON.stringify([a])]);
  await reserveAttempt(exhausted,'kimi-k3.1-pro',price,1000,800000);await recoverInterrupted();await run("UPDATE imports SET status='running' WHERE id=?",[exhausted]);
  await assert.rejects(()=>reserveAttempt(exhausted,'kimi-k3.1-pro',price,1000,cost),/预算/);
  // Resume a partially-applied migration and preserve historical completion flags.
  const legacy=randomUUID(),legacyTask=randomUUID();
  await run("INSERT INTO imports(id,family_id,child_ids,work_date,source_text,status) VALUES(?,?,?,'2026-11-24','旧记录','failed')",[legacy,family,JSON.stringify([a])]);
  await run("INSERT INTO assignments(id,family_id,child_id,import_id,work_date,subject,content,completed,revision) VALUES(?,?,?,?,'2026-11-24','语文','旧任务',TRUE,3)",[legacyTask,family,a,legacy]);
  await run('DELETE FROM schema_migrations WHERE version=2');await migrate();await migrate();
  const [oldTask]=await rows('SELECT completed,priority,revision FROM assignments WHERE id=?',[legacyTask]);assert.equal(Number(oldTask.completed),1);assert.equal(oldTask.priority,'normal');assert.equal(oldTask.revision,3);
  assert.equal((await billingSummary(legacy)).legacyUsageUnknown,true);assert.equal((await request(`/api/imports/${legacy}/retry`,'POST')).statusCode,409);
 }finally{
  for(const table of ['ai_attempts','assignments','attachments','imports','pairing_codes','sessions','children'])await run(`DELETE FROM ${table} WHERE family_id=?`,[family]).catch(()=>{});
  await run('DELETE FROM families WHERE id=?',[family]).catch(()=>{});await app.close();await pool.end();
 }
});
