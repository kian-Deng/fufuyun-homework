import {readFile} from 'node:fs/promises';
import {parseGeneratedResult,type Draft} from './domain.js';
import {SYSTEM_PROMPT} from './prompt.js';
import {MAX_OUTPUT,priceFor,reserveCost,type Price} from './budget.js';

export type BillingHooks={reserve:(model:string,price:Price,input:number,cost:number)=>Promise<string>;settle:(id:string,usage:unknown,price:Price,error?:string)=>Promise<void>};
export async function analyze(text:string,date:string,images:{path:string;mime:string}[],billing:BillingHooks,signal?:AbortSignal):Promise<Draft>{
  const key=process.env.MOONSHOT_API_KEY;
  if(!key)throw new Error('尚未配置 Kimi API 密钥，请配置服务端 MOONSHOT_API_KEY 后重试');
  const model=process.env.MOONSHOT_MODEL??'kimi-k3.1-pro';
  const price=priceFor(model);
  const base=(process.env.MOONSHOT_BASE_URL??'https://api.moonshot.cn/v1').trim().replace(/\/+$/,'');
  const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const requestSignal=signal??AbortSignal.timeout(120000);
  const content:any[]=[{type:'text',text:'所属日期：'+date+'\n待整理数据：\n'+text}];
  for(const image of images)content.push({type:'image_url',image_url:{url:'data:'+image.mime+';base64,'+(await readFile(image.path)).toString('base64')}});
  const system={role:'system',content:SYSTEM_PROMPT};
  const messages=[system,{role:'user',content}];
  async function estimate(messages:any[]){
    try{
      const r=await fetch(base+'/tokenizers/estimate-token-count',{method:'POST',headers,signal:requestSignal,body:JSON.stringify({model,messages})});
      if(!r.ok)throw new Error('estimate');
      const body:any=await r.json();const count=body.data?.total_tokens;
      if(!Number.isSafeInteger(count)||count<1)throw new Error('estimate');
      return count as number;
    }catch{throw new Error('Token 估算失败，未发起生成；请检查接口网络或稍后手动重试');}
  }
  if(await estimate([system,{role:'user',content:'测'}])>600)throw new Error('提示词超过 600 tokens，已阻止生成，请联系管理员优化提示词');
  const input=await estimate(messages);
  const reservation=reserveCost(input,price);
  const attempt=await billing.reserve(model,price,input,reservation);
  let usage:unknown;let settled=false;
  try{
    const response=await fetch(base+'/chat/completions',{method:'POST',headers,signal:requestSignal,body:JSON.stringify({model,messages,response_format:{type:'json_object'},reasoning_effort:'low',prompt_cache_options:{mode:'implicit',ttl:'5m'},max_completion_tokens:MAX_OUTPUT})});
    if(!response.ok)throw new Error('Kimi 请求失败（HTTP '+response.status+'），请核对接口、模型和账号权限；费用暂按预留记录');
    const body:any=await response.json();usage=body.usage;
    if(body.choices?.[0]?.finish_reason==='length')throw new Error('AI 输出达到上限，未发布不完整结果；请精简消息或手动整理');
    if(body.choices?.[0]?.finish_reason!=='stop')throw new Error('AI 未完整返回任务，请手动重试或整理');
    let result:Draft;
    try{result=parseGeneratedResult(body.choices?.[0]?.message?.content??'');}catch{throw new Error('AI 返回格式不符合要求，请手动整理或在剩余预算内重试');}
    await billing.settle(attempt,usage,price);settled=true;
    return result;
  }catch(e){
    const safe=e instanceof Error&&e.message.startsWith('AI ')?e.message:e instanceof Error&&e.message.startsWith('Kimi 请求失败')?e.message:'AI 请求中断或超时，费用暂按预留记录；不会自动重试';
    if(!settled)await billing.settle(attempt,usage,price,safe);
    throw new Error(safe);
  }
}
