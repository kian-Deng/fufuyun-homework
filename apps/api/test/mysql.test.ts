import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {buildApp} from '../src/app.js';
import {migrate,pool,run,rows} from '../src/db.js';
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
  const draft={items:[{subject:'数学',content:'第12页第1题',dueDate:null,materials:'',warning:''}],notices:[]};
  await run("INSERT INTO imports(id,family_id,child_ids,work_date,source_text,status,result) VALUES(?,?,?,'2026-11-24',?,'review',?)",[iid,family,JSON.stringify([a,b]),'测试消息',JSON.stringify(draft)]);
  await run('INSERT INTO attachments(id,import_id,family_id,name,mime,path) VALUES(?,?,?,?,?,?)',[attachment,iid,family,'test.png','image/png','not-a-real-file']);
  assert.equal((await request(`/api/attachments/${attachment}`,'GET',undefined,child)).statusCode,403);
  assert.equal((await request(`/api/assignments?childId=${b}`,'GET',undefined,child)).statusCode,403);
  const list=(await request('/api/children','GET',undefined,child)).json();assert.equal(list.length,1);assert.equal(list[0].id,a);
  const published=await request(`/api/imports/${iid}/publish`,'POST',{version:0});assert.equal(published.statusCode,200,published.body);assert.equal(published.json().count,2);
  assert.equal((await request(`/api/imports/${iid}/publish`,'POST',{version:0})).statusCode,409);
  const [assignment]=(await request(`/api/assignments?childId=${a}`)).json();
  assert.equal((await request(`/api/assignments/${assignment.id}/complete`,'PUT',{completed:true,revision:1},child)).statusCode,200);
  const [sibling]=(await request(`/api/assignments?childId=${b}`)).json();assert.equal(Number(sibling.completed),0);
  assert.equal((await request(`/api/assignments/${assignment.id}`,'PUT',{...draft.items[0],content:'更新为第13页',revision:1})).statusCode,200);
  const [updated]=(await request(`/api/assignments?childId=${a}`)).json();assert.equal(Number(updated.completed),0);assert.equal(updated.revision,2);assert.equal(Number(updated.updated),1);
  assert.equal((await request(`/api/assignments/${assignment.id}/complete`,'PUT',{completed:true,revision:1},child)).statusCode,409);
  const pair=await request('/api/pairing','POST',{childId:a});const code=pair.json().code;assert.equal(code.length,12);
  const paired=await request('/api/auth/pair','POST',{code});assert.equal(paired.statusCode,200);assert.equal((await request('/api/auth/pair','POST',{code})).statusCode,400);
  const newToken=paired.json().token;assert.equal((await request(`/api/devices/${hash(newToken)}`,'DELETE')).statusCode,200);assert.equal((await request('/api/me','GET',undefined,newToken)).statusCode,401);
  assert.equal((await request(`/api/imports/${iid}/withdraw`,'POST')).statusCode,200);assert.equal((await request(`/api/assignments?childId=${a}`)).json().length,0);
  assert.equal((await request(`/api/attachments/${attachment}`,'GET',undefined,child)).statusCode,403);
 }finally{
  for(const table of ['assignments','attachments','imports','pairing_codes','sessions','children'])await run(`DELETE FROM ${table} WHERE family_id=?`,[family]).catch(()=>{});
  await run('DELETE FROM families WHERE id=?',[family]).catch(()=>{});await app.close();await pool.end();
 }
});
