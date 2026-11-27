import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualTasks} from '../src/manual.js';
import {familyTokenFromHash,isFamilyEntry,initializeFamilyEntry,api,FAMILY_STORAGE_KEY} from '../../web/src/api.ts';
test('direct entry is exactly one verbatim task, including numbering, headings and blank lines',()=>{
 const text=' 语文作业：\n1.复习1.2.3.8单元\n\n2.完成区本14课课后练 ';
 const result=manualTasks(text,'2026-11-27');
 assert.equal(result.items.length,1);assert.equal(result.items[0].content,text);assert.equal(result.items[0].subject,'语文');
 assert.equal(manualTasks('1.任务\n2.任务','2026-11-27').items[0].content,'1.任务\n2.任务');
 assert.throws(()=>manualTasks('','2026-11-27'));assert.throws(()=>manualTasks(' '.repeat(3),'2026-11-27'));
 assert.throws(()=>manualTasks('字'.repeat(3001),'2026-11-27'),/3000/);
});
test('manual metadata can suggest a subject/date without altering the single task content',()=>{
 const text='语文：朗读课文，不用上交\n明天检查美术作品';const result=manualTasks(text,'2026-12-31');
 assert.equal(result.items.length,1);assert.equal(result.items[0].subject,'待确认');assert.ok(result.items[0].warning);assert.equal(result.items[0].dueDate,'2027-01-01');assert.equal(result.items[0].content,text);
 assert.equal(manualTasks('整理书桌','2026-11-27').items[0].subject,'待确认');
});

test('shared child entry recognizes only valid fragment credentials and stays separate from root login',()=>{
 const token='family_'+'a'.repeat(43);
 assert.equal(familyTokenFromHash('#access='+token),token);assert.equal(familyTokenFromHash('#access=bad'),null);assert.equal(isFamilyEntry('/child'),true);assert.equal(isFamilyEntry('/child/'),true);assert.equal(isFamilyEntry('/'),false);assert.equal(isFamilyEntry('/children'),false);
});
test('shared entry never sends a saved parent token and revocation does not log the parent out',async()=>{
 const previous={window:globalThis.window,storage:globalThis.localStorage,fetch:globalThis.fetch};
 const values=new Map<string,string>([['homework_token','parent-secret-test-only']]);
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
 const token='family_'+'b'.repeat(43);const location={pathname:'/child',hash:'#access='+token};let authorization='';let status=200;
 try{
  Object.assign(globalThis,{window:{location,dispatchEvent:()=>{}},localStorage:storage,fetch:async(_url:unknown,init:RequestInit)=>{authorization=new Headers(init.headers).get('Authorization')??'';return new Response(JSON.stringify({message:'revoked'}),{status});}});
  assert.equal(initializeFamilyEntry(),true);await api('/me');assert.equal(authorization,'Bearer '+token);
  status=401;await assert.rejects(()=>api('/me'),/revoked/);assert.equal(values.has(FAMILY_STORAGE_KEY),false);assert.equal(values.get('homework_token'),'parent-secret-test-only');
  location.pathname='/';status=200;await api('/me');assert.equal(authorization,'Bearer parent-secret-test-only');
 }finally{
  if(previous.window===undefined)delete (globalThis as any).window;else globalThis.window=previous.window;
  if(previous.storage===undefined)delete (globalThis as any).localStorage;else Object.defineProperty(globalThis,'localStorage',{value:previous.storage,writable:true,configurable:true});
  globalThis.fetch=previous.fetch;
 }
});
