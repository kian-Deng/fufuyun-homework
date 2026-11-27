import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualTasks} from '../src/manual.js';
import {familyTokenFromHash,isFamilyEntry,initializeFamilyEntry,api,FAMILY_STORAGE_KEY} from '../../web/src/api.ts';
test('subject headings classify tasks without adding a task or rewriting original wording',()=>{
 const result=manualTasks('语文作业：\n1.复习1.2.3.8单元\n2.完成区本14课课后练','2026-11-27');
 assert.deepEqual(result.items.map(t=>({subject:t.subject,content:t.content})),[
  {subject:'语文',content:'复习1.2.3.8单元'},
  {subject:'语文',content:'完成区本14课课后练'}
 ]);
 const mixed=manualTasks('语文作业：\n1.复习1.2.3.8单元\n注意复习范围\n数学：\n1.完成区本14课课后练\n英语作业：\n朗读两遍\n朗读两遍','2026-11-27');
 assert.deepEqual(mixed.items.map(t=>t.subject),['语文','数学','英语','英语']);
 assert.equal(mixed.items[0].content,'复习1.2.3.8单元\n注意复习范围');
 assert.equal(mixed.items[2].content,mixed.items[3].content,'manual entry does not deduplicate or rewrite tasks');
 assert.throws(()=>manualTasks('语文作业：','2026-11-27'),/填写任务/);
});
test('organized homework is split without inventing poems or using an AI provider',()=>{
 const text='1.复习1.2.3.8单元默写所有古诗（明天检查）\n2.小练笔：关键词：他是一头蓄势待发的小猎豹';
 const result=manualTasks(text,'2026-11-27');
 assert.equal(result.items.length,2);assert.equal(result.items[0].subject,'语文');assert.equal(result.items[0].priority,'high');assert.equal(result.items[0].dueDate,'2026-11-28');assert.equal(result.items[0].content,'复习1.2.3.8单元默写所有古诗（明天检查）');
 assert.equal(result.items[1].content,'小练笔：关键词：他是一头蓄势待发的小猎豹');assert.equal(result.items[1].subject,'语文');assert.equal(result.items[1].priority,'normal');assert.equal(result.items[1].dueDate,null);
});
test('manual rules preserve continuation lines, negate requirements and flag unknown subjects',()=>{
 const result=manualTasks('1.语文：朗读课文，不用上交\n注意停顿\n2.明天检查美术作品\n3.整理书桌','2026-12-31');
 assert.equal(result.items.length,3);assert.match(result.items[0].content,/注意停顿/);assert.equal(result.items[0].priority,'normal');assert.equal(result.items[1].dueDate,'2027-01-01');assert.equal(result.items[1].subject,'美术');assert.equal(result.items[1].priority,'high');assert.equal(result.items[2].subject,'待确认');assert.ok(result.items[2].warning);
 assert.throws(()=>manualTasks('','2026-11-27'));assert.throws(()=>manualTasks(Array.from({length:101},(_,i)=>`${i+1}.任务`).join('\n'),'2026-11-27'));
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
