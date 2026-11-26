export const BUDGET_MICROS=800_000;
export const MAX_INPUT=8000;
export const MAX_OUTPUT=4096;
export const MAX_ATTEMPTS=2;
export type Price={input:number;output:number;cacheRead:number;cacheWrite:number;version:string};
export type Usage={prompt_tokens:number;completion_tokens:number;prompt_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number};cached_tokens?:number;completion_tokens_details?:{reasoning_tokens?:number}};
const defaultPrices:Record<string,Price>={
  'kimi-k3.1-pro':{input:13,output:68,cacheRead:1.3,cacheWrite:13,version:'2026-11-26/CNY-per-MTok/5m'}
};
export function priceFor(model:string):Price {
  let table:Record<string,Price>;
  try{table=process.env.KIMI_PRICE_TABLE_JSON?JSON.parse(process.env.KIMI_PRICE_TABLE_JSON):defaultPrices;}catch{throw new Error('AI 价格配置格式无效，请联系家长管理员');}
  const p=table?.[model];
  if(!p||typeof p.version!=='string'||!p.version||![p.input,p.output,p.cacheRead,p.cacheWrite].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||p.input<=0||p.output<=0)throw new Error('当前模型没有有效价格配置，已阻止调用以保护预算');
  return p;
}
export function reserveCost(input:number,p:Price):number {
  if(!Number.isSafeInteger(input)||input<1||input>MAX_INPUT)throw new Error(`输入超过 ${MAX_INPUT} tokens 或估算无效，请精简消息/截图，不会截断任务`);
  // CNY/MTok is numerically equal to micro-CNY/token. Include 20% estimation margin.
  return Math.ceil((input*Math.max(p.input,p.cacheWrite,p.cacheRead)+MAX_OUTPUT*p.output)*1.2);
}
export function validateUsage(value:any):Usage|null {
  if(!value||![value.prompt_tokens,value.completion_tokens].every(n=>Number.isSafeInteger(n)&&n>=0)||value.prompt_tokens===0)return null;
  const cached=value.prompt_tokens_details?.cached_tokens??value.cached_tokens??0;
  const written=value.prompt_tokens_details?.cache_write_tokens??0;
  if(![cached,written].every(n=>Number.isSafeInteger(n)&&n>=0)||cached+written>value.prompt_tokens)return null;
  return value;
}
export function usageCost(u:Usage,p:Price):number {
  const cached=u.prompt_tokens_details?.cached_tokens??u.cached_tokens??0;
  // Without a detailed breakdown, conservatively price missing input at the highest input rate.
  const written=u.prompt_tokens_details?.cache_write_tokens??0;
  return Math.ceil((u.prompt_tokens-cached-written)*Math.max(p.input,p.cacheWrite)+cached*p.cacheRead+written*p.cacheWrite+u.completion_tokens*p.output);
}
export function checkAllowance(count:number,committed:number,reservation:number){
  if(count>=MAX_ATTEMPTS)throw new Error('该批已达到两次生成调用上限，请手动整理，不会自动继续收费');
  if(committed+reservation>BUDGET_MICROS)throw new Error('该批剩余预算不足 ¥0.80 控制阈值，已阻止再次调用；请手动整理');
}
