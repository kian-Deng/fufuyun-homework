import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyze,type BillingHooks} from '../src/kimi.js';
import {checkAllowance,validateUsage,usageCost} from '../src/budget.js';

test('Kimi: token preflight, task JSON, bounded generation and safe accounting',async t=>{
 const saved={key:process.env.MOONSHOT_API_KEY,base:process.env.MOONSHOT_BASE_URL,model:process.env.MOONSHOT_MODEL,prices:process.env.KIMI_PRICE_TABLE_JSON};
 let input=4000,prompt=300,estimateStatus=200,status=200,disconnect=false,calls:any[]=[],ledger:any[]=[];
 const normal={choices:[{message:{content:JSON.stringify({items:[{subject:'语文',content:'准备第8课听写',priority:'high',priorityReason:'明天听写'}]})},finish_reason:'stop'}],usage:{prompt_tokens:4000,completion_tokens:1000,completion_tokens_details:{reasoning_tokens:700},prompt_tokens_details:{cached_tokens:1000,cache_write_tokens:1000}}};
 let response:any=normal;
 const billing:BillingHooks={reserve:async(model,price,estimated,reserved)=>{checkAllowance(ledger.length,ledger.reduce((s,a)=>s+(a.charge??a.reserved),0),reserved);const id=String(ledger.length);ledger.push({model,price,estimated,reserved,state:'reserved'});return id;},settle:async(id,usage,price,error)=>{const valid=validateUsage(usage);Object.assign(ledger[Number(id)],{state:valid?'settled':'unknown',charge:valid?usageCost(valid,price):null,error});}};
 const server=createServer(async(req,res)=>{
  let text='';for await(const p of req)text+=p;const body=JSON.parse(text);calls.push({path:req.url,body});
  if(req.url?.includes('estimate-token-count')){res.writeHead(estimateStatus,{'Content-Type':'application/json'});res.end(JSON.stringify({data:{total_tokens:typeof body.messages[1].content==='string'?prompt:input}}));return;}
  if(disconnect){req.socket.destroy();return;}
  res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(response));
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 process.env.MOONSHOT_API_KEY='fake-test-only';process.env.MOONSHOT_BASE_URL='http://127.0.0.1:'+ (server.address() as any).port+'/v1';process.env.MOONSHOT_MODEL='kimi-k3.1-pro';delete process.env.KIMI_PRICE_TABLE_JSON;
 const reset=()=>{input=4000;prompt=300;estimateStatus=200;status=200;disconnect=false;calls=[];ledger=[];response=normal;};
 const chatCalls=()=>calls.filter(c=>c.path==='/v1/chat/completions');
 const call=()=>analyze('语文明天听写第8课','2026-11-26',[],billing);
 try{
  await t.test('short prompt and total input are estimated before one bounded call',async()=>{reset();const result=await call();assert.equal(result.items[0].priority,'high');assert.equal(calls.length,3);const request=chatCalls()[0].body;assert.equal(request.max_completion_tokens,4096);assert.equal(request.reasoning_effort,'low');assert.equal(request.prompt_cache_options.ttl,'5m');assert.equal(request.response_format.type,'json_object');assert.ok(request.messages[1].content[0].text.includes('2026-11-26'));assert.equal(ledger[0].state,'settled');assert.equal(ledger[0].charge,108300);});
  await t.test('images are part of the same input-token estimate',async()=>{reset();const dir=await mkdtemp(join(tmpdir(),'kimi-test-'));try{const path=join(dir,'image.png');await writeFile(path,Buffer.from('test image'));await analyze('图片作业','2026-11-26',[{path,mime:'image/png'}],billing);assert.ok(calls[1].body.messages[1].content[1].image_url.url.startsWith('data:image/png;base64,'));assert.deepEqual(calls[1].body.messages,chatCalls()[0].body.messages);}finally{await rm(dir,{recursive:true,force:true});}});
  await t.test('input overflow does not truncate or generate',async()=>{reset();input=8001;await assert.rejects(call,/8000/);assert.equal(chatCalls().length,0);assert.equal(ledger.length,0);});
  await t.test('oversized prompt or failed estimate blocks paid generation',async()=>{reset();prompt=601;await assert.rejects(call,/600/);assert.equal(chatCalls().length,0);reset();estimateStatus=500;await assert.rejects(call,/估算失败/);assert.equal(ledger.length,0);});
  await t.test('unknown prices, exhausted budget and max attempts fail closed',async()=>{reset();process.env.MOONSHOT_MODEL='unknown';await assert.rejects(call,/价格配置/);assert.equal(calls.length,0);process.env.MOONSHOT_MODEL='kimi-k3.1-pro';ledger=[{reserved:800000,state:'unknown'}];await assert.rejects(call,/预算/);assert.equal(chatCalls().length,0);ledger=[{charge:1},{charge:1}];await assert.rejects(call,/两次/);});
  await t.test('invalid or truncated JSON remains billable, never accepted or retried automatically',async()=>{reset();response={...normal,choices:[{message:{content:'not json'},finish_reason:'stop'}]};await assert.rejects(call,/格式/);assert.equal(ledger[0].state,'settled');assert.equal(chatCalls().length,1);reset();response={...normal,choices:[{message:{content:'{}'},finish_reason:'length'}]};await assert.rejects(call,/上限/);assert.equal(ledger[0].state,'settled');});
  await t.test('HTTP and network failures preserve reservations without exposing upstream data',async()=>{reset();status=404;response={secret:'private-upstream-message'};await assert.rejects(call,e=>e instanceof Error&&e.message.includes('404')&&!e.message.includes('private-upstream'));assert.equal(ledger[0].state,'unknown');assert.equal(chatCalls().length,1);reset();disconnect=true;await assert.rejects(call,/中断或超时/);assert.equal(ledger[0].state,'unknown');assert.equal(chatCalls().length,1);});
  await t.test('missing usage keeps a reservation and missing credentials make no requests',async()=>{reset();response={...normal,usage:undefined};await call();assert.equal(ledger[0].state,'unknown');reset();delete process.env.MOONSHOT_API_KEY;await assert.rejects(call,/密钥/);assert.equal(calls.length,0);});
 }finally{
  for(const [name,value] of Object.entries({MOONSHOT_API_KEY:saved.key,MOONSHOT_BASE_URL:saved.base,MOONSHOT_MODEL:saved.model,KIMI_PRICE_TABLE_JSON:saved.prices})){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));
 }
});
