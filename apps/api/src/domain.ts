import { z } from 'zod';
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, '日期无效');
export const item = z.object({subject:z.string().trim().min(1).max(30),content:z.string().trim().min(1).max(3000),priority:z.enum(['high','normal']).default('normal'),priorityReason:z.string().trim().max(200).default(''),dueDate:day.nullable().default(null),materials:z.string().max(500).default(''),warning:z.string().max(500).default('')});
export const resultSchema = z.object({items:z.array(item).max(100),notices:z.array(z.string().max(2000)).max(30).default([])});
export type Draft = z.infer<typeof resultSchema>;
export class HttpError extends Error { constructor(public statusCode:number,message:string) {super(message);} }
export function parseResult(s:string):Draft { return resultSchema.parse(JSON.parse(s)); }
export function parseGeneratedResult(s:string):Draft {
  const generated=resultSchema.extend({items:z.array(item.extend({priority:z.enum(['high','normal'])})).max(100)});
  const result=generated.parse(JSON.parse(s));
  const seen=new Set<string>();
  result.items=result.items.filter(task=>{
    // Only identical generated items are duplicates. Different requirements survive.
    const key=JSON.stringify([task.subject,task.content,task.priority,task.priorityReason,task.dueDate,task.materials,task.warning]);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
  return result;
}
export function today() {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function extractText(name:string, bytes:Buffer):string {
  const text=bytes.toString('utf8').replace(/^\uFEFF/,'');
  if (/\.txt$/i.test(name)) return z.string().max(50000).parse(text);
  if (/\.json$/i.test(name)) {
    const data=JSON.parse(text);
    if(typeof data==='string') return z.string().max(50000).parse(data);
    const messages=z.object({messages:z.array(z.object({text:z.string().max(10000)})).max(500)}).parse(data);
    return z.string().max(50000).parse(messages.messages.map(m=>m.text).join('\n'));
  }
  throw new HttpError(400,'文件仅支持 UTF-8 TXT、约定格式 JSON 或 JPG/PNG/WEBP 截图');
}
