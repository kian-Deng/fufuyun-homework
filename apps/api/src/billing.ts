import {randomUUID} from 'node:crypto';
import {rows,run,transaction} from './db.js';
import {BUDGET_MICROS,checkAllowance,usageCost,validateUsage,type Price} from './budget.js';

export async function reserveAttempt(importId:string,model:string,price:Price,input:number,cost:number){
  return transaction(async db=>{
    const [job]=await rows('SELECT family_id,status,ai_legacy_unknown FROM imports WHERE id=? FOR UPDATE',[importId],db);
    if(!job||job.status!=='running')throw new Error('分析状态已变化，未发起生成');
    if(job.ai_legacy_unknown)throw new Error('旧版记录的历史用量未知，已禁止再次调用；请手动整理');
    const attempts=await rows('SELECT state,reserved_micros,charged_micros FROM ai_attempts WHERE import_id=?',[importId],db);
    if(attempts.some(a=>a.state==='reserved'))throw new Error('已有生成请求正在处理');
    const committed=attempts.reduce((sum,a)=>sum+Number(a.charged_micros??a.reserved_micros),0);
    checkAllowance(attempts.length,committed,cost);
    const id=randomUUID();await run("INSERT INTO ai_attempts(id,import_id,family_id,model,price_snapshot,estimated_input,reserved_micros,state) VALUES(?,?,?,?,?,?,?,'reserved')",[id,importId,job.family_id,model,JSON.stringify(price),input,cost],db);return id;
  });
}
export async function settleAttempt(id:string,usage:unknown,price:Price,error?:string){
  const valid=validateUsage(usage);
  await run("UPDATE ai_attempts SET state=?,charged_micros=?,usage_json=?,error=? WHERE id=? AND state='reserved'",[valid?'settled':'unknown',valid?usageCost(valid,price):null,valid?JSON.stringify(valid):null,error?.slice(0,500)??null,id]);
}
export async function billingSummary(importId:string){
  const [job]=await rows('SELECT ai_legacy_unknown FROM imports WHERE id=?',[importId]);
  const attempts=await rows('SELECT id,model,estimated_input,reserved_micros,charged_micros,state,usage_json,price_snapshot,created_at FROM ai_attempts WHERE import_id=? ORDER BY created_at,id',[importId]);
  const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
  return {legacyUsageUnknown:!!job?.ai_legacy_unknown,budgetCny:BUDGET_MICROS/1e6,committedCny:attempts.reduce((s,a)=>s+Number(a.charged_micros??a.reserved_micros),0)/1e6,attempts:attempts.map(a=>({id:a.id,model:a.model,state:a.state,estimatedInput:a.estimated_input,reservedCny:Number(a.reserved_micros)/1e6,estimatedCny:a.charged_micros===null?null:Number(a.charged_micros)/1e6,usage:decode(a.usage_json),price:decode(a.price_snapshot),createdAt:a.created_at}))};
}
