import { rows, run, transaction } from './db.js';
import {analyze} from './kimi.js';
import {reserveAttempt,settleAttempt} from './billing.js';
let stopping=false;let timer:ReturnType<typeof setTimeout>|undefined;let active:AbortController|undefined;let running:Promise<void>|undefined;
async function tick(){
 if(stopping)return;
 const job=await transaction(async db=>{const [j]=await rows("SELECT * FROM imports WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[],db);if(j)await run("UPDATE imports SET status='running',error=NULL WHERE id=?",[j.id],db);return j;});
 if(!job)return;
 try {active=new AbortController();const signal=AbortSignal.any([active.signal,AbortSignal.timeout(120000)]);const images=await rows("SELECT path,mime FROM attachments WHERE import_id=? AND mime LIKE 'image/%'",[job.id]);const result=await analyze(job.source_text,job.work_date,images as any,{reserve:(model,price,input,cost)=>reserveAttempt(job.id,model,price,input,cost),settle:settleAttempt},signal);const ids:string[]=typeof job.child_ids==='string'?JSON.parse(job.child_ids):job.child_ids;const existing=await rows(`SELECT subject,content FROM assignments WHERE family_id=? AND work_date=? AND child_id IN (${ids.map(()=>'?').join(',')})`,[job.family_id,job.work_date,...ids]);for(const item of result.items){if(existing.some(a=>a.subject===item.subject&&a.content.trim()===item.content.trim()))item.warning=[item.warning,'同日已有相同作业，请确认是否重复'].filter(Boolean).join('；').slice(0,500);}await run("UPDATE imports SET status='review',result=?,version=version+1 WHERE id=? AND status='running'",[JSON.stringify(result),job.id]);}
 catch(e){await run("UPDATE imports SET status='failed',error=? WHERE id=? AND status='running'",[e instanceof Error?e.message.slice(0,500):'分析失败',job.id]);}finally{active=undefined;}
}
export async function recoverInterrupted(){
 await transaction(async db=>{
  await run("UPDATE ai_attempts SET state='unknown',error='服务中断，用量未知；保留预留费用' WHERE state='reserved'",[],db);
  await run("UPDATE imports SET status='failed',error='上次分析因服务中断而停止，请查看预算后手动重试或整理',version=version+1 WHERE status='running'",[],db);
 });
}
export async function startWorker(onError:(e:unknown)=>void){stopping=false;await recoverInterrupted();const loop=()=>{running=tick().catch(onError).finally(()=>{if(!stopping)timer=setTimeout(loop,1500);});};loop();}
export async function stopWorker(){stopping=true;clearTimeout(timer);active?.abort();await running;}
