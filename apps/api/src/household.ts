import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {day,HttpError} from './domain.js';
import {rows,run,transaction} from './db.js';

export function allocationDates(start:string,end:string,weekdays:number[]):string[]{
  day.parse(start);day.parse(end);
  const first=Date.parse(start+'T00:00:00Z'),last=Date.parse(end+'T00:00:00Z');
  if(last<first||last-first>365*86400000)throw new HttpError(400,'日期范围须按先后顺序，最多366天');
  if(!weekdays.length||weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))throw new HttpError(400,'请选择有效的星期');
  const dates:string[]=[];
  for(let value=first;value<=last;value+=86400000){const date=new Date(value);if(weekdays.includes(date.getUTCDay()||7))dates.push(date.toISOString().slice(0,10));}
  if(!dates.length)throw new HttpError(400,'日期范围内没有所选星期，请调整');
  return dates;
}
const uuid=z.string().uuid();
const ids=z.array(uuid).min(1).max(20).refine(v=>new Set(v).size===v.length,'不能重复选择');
const weekdayList=z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(v=>new Set(v).size===v.length,'星期不能重复');
const scheduleSchema=z.union([
  z.object({mode:z.literal('range'),startDate:day,endDate:day}).strict(),
  z.object({mode:z.literal('weekly'),startDate:day,weeks:z.number().int().min(1).max(52),weekdays:weekdayList}).strict(),
  // Compatibility for already-open clients from the previous release.
  z.object({startDate:day,endDate:day,weekdays:weekdayList}).strict()
]);
export function scheduleDates(input:unknown){
  const value=scheduleSchema.parse(input);
  if('mode' in value&&value.mode==='weekly'){
    const end=new Date(value.startDate+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+value.weeks*7-1);
    const endDate=end.toISOString().slice(0,10);
    return {...value,endDate,dates:allocationDates(value.startDate,endDate,value.weekdays)};
  }
  const weekdays='weekdays' in value?value.weekdays:[1,2,3,4,5,6,7];
  return {...value,mode:'mode' in value?'range' as const:'legacy' as const,weekdays,dates:allocationDates(value.startDate,value.endDate,weekdays)};
}
const template=z.object({content:z.string().trim().min(1).max(3000),priority:z.enum(['high','normal']).default('normal')});
export function registerHouseholdTasks(app:FastifyInstance,parent:(req:FastifyRequest)=>void,ownChildren:(ids:string[],family:string,db?:any)=>Promise<void>){
  app.get('/api/household-tasks/publications',async req=>{
    parent(req);const {offset}=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse(req.query);
    const batches=await rows("SELECT id,child_ids,work_date,source_text,created_at,UNIX_TIMESTAMP(created_at) assigned_timestamp,allocation_rule FROM imports WHERE family_id=? AND import_kind='household' ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET "+offset,[req.session.family_id]);
    if(!batches.length)return {items:[],nextOffset:null};
    const marks=batches.map(()=>'?').join(','),batchIds=batches.map(b=>b.id);
    const [stats,legacyTasks,children]=await Promise.all([
      rows(`SELECT import_id,child_id,COUNT(*) total,SUM(completed) completed,MIN(work_date) start_date,MAX(work_date) end_date FROM assignments WHERE family_id=? AND import_id IN (${marks}) GROUP BY import_id,child_id`,[req.session.family_id,...batchIds]),
      rows(`SELECT DISTINCT import_id,child_id,content FROM assignments WHERE family_id=? AND import_id IN (${marks})`,[req.session.family_id,...batchIds]),
      rows('SELECT id,name FROM children WHERE family_id=?',[req.session.family_id])
    ]);
    const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
    return {items:batches.flatMap(batch=>{
      const rule=batch.allocation_rule?decode(batch.allocation_rule):null;
      return decode(batch.child_ids).map((childId:string)=>{
        const stat=stats.find(s=>s.import_id===batch.id&&s.child_id===childId),total=Number(stat?.total??0),completed=Number(stat?.completed??0);
        const snapshot=rule?.entries?.filter((e:any)=>e.childId===childId).map((e:any)=>e.content);
        return {id:batch.id+':'+childId,publicationId:batch.id,childId,childName:rule?.children?.find((c:any)=>c.id===childId)?.name??children.find(c=>c.id===childId)?.name??'孩子',assignedAt:new Date(Number(batch.assigned_timestamp)*1000).toISOString(),startDate:rule?.startDate??stat?.start_date??batch.work_date,endDate:rule?.endDate??stat?.end_date??null,mode:rule?.mode??'legacy',weekdays:rule?.weekdays??[],weeks:rule?.weeks??null,tasks:snapshot??(legacyTasks.some(t=>t.import_id===batch.id&&t.child_id===childId)?legacyTasks.filter(t=>t.import_id===batch.id&&t.child_id===childId).map(t=>t.content):[batch.source_text]),total,completed,removed:Math.max(0,Number(rule?.counts?.[childId]??total)-total)};
      });
    }),nextOffset:batches.length===10?offset+10:null};
  });
  app.get('/api/household-tasks',async req=>{parent(req);return rows('SELECT id,content,priority,revision FROM household_tasks WHERE family_id=? AND archived=FALSE ORDER BY created_at,id',[req.session.family_id]);});
  app.post('/api/household-tasks',async req=>{parent(req);const value=template.parse(req.body),id=randomUUID();await run('INSERT INTO household_tasks(id,family_id,content,priority) VALUES(?,?,?,?)',[id,req.session.family_id,value.content,value.priority]);return {id,...value,revision:1};});
  app.put('/api/household-tasks/:id',async req=>{parent(req);const value=template.extend({revision:z.number().int().positive()}).parse(req.body);const result=await run('UPDATE household_tasks SET content=?,priority=?,revision=revision+1 WHERE id=? AND family_id=? AND revision=? AND archived=FALSE',[value.content,value.priority,uuid.parse((req.params as any).id),req.session.family_id,value.revision]);if(!result.affectedRows)throw new HttpError(409,'家庭任务已变化，请刷新');return {ok:true};});
  app.delete('/api/household-tasks/:id',async req=>{parent(req);const {revision}=z.object({revision:z.number().int().positive()}).parse(req.body);const result=await run('UPDATE household_tasks SET archived=TRUE,revision=revision+1 WHERE id=? AND family_id=? AND revision=? AND archived=FALSE',[uuid.parse((req.params as any).id),req.session.family_id,revision]);if(!result.affectedRows)throw new HttpError(409,'家庭任务已变化，请刷新');return {ok:true};});
  app.post('/api/household-tasks/assign',async req=>{
    parent(req);const {taskIds,childIds,...scheduleInput}=z.object({taskIds:ids,childIds:ids}).passthrough().parse(req.body);
    const schedule=scheduleDates(scheduleInput),value={taskIds,childIds,...schedule},dates=schedule.dates;
    if(dates.length*value.taskIds.length*value.childIds.length>2000)throw new HttpError(400,'一次最多分配2000项，请缩短日期范围或减少任务、孩子');
    return transaction(async db=>{
      // Lock templates in a stable order: overlapping allocation requests serialize.
      const tasks=await rows(`SELECT id,content,priority FROM household_tasks WHERE family_id=? AND archived=FALSE AND id IN (${value.taskIds.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,[req.session.family_id,...value.taskIds],db);
      if(tasks.length!==value.taskIds.length)throw new HttpError(400,'家庭任务不存在或已移除');
      await ownChildren(value.childIds,req.session.family_id,db);
      const existing=await rows(`SELECT household_task_id,child_id,work_date FROM assignments WHERE family_id=? AND household_task_id IN (${value.taskIds.map(()=>'?').join(',')}) AND work_date BETWEEN ? AND ?`,[req.session.family_id,...value.taskIds,value.startDate,value.endDate],db);
      const keys=new Set(existing.map(t=>[t.household_task_id,t.child_id,t.work_date].join(':')));
      const pending:{task:typeof tasks[number];child:string;date:string}[]=[];let skipped=0;
      for(const task of tasks)for(const child of value.childIds)for(const date of dates){if(keys.has([task.id,child,date].join(':')))skipped++;else pending.push({task,child,date});}
      if(pending.length){
        const batch=randomUUID();
        const actualChildren=[...new Set(pending.map(p=>p.child))];
        const children=await rows(`SELECT id,name FROM children WHERE family_id=? AND id IN (${actualChildren.map(()=>'?').join(',')})`,[req.session.family_id,...actualChildren],db);
        const rule={mode:schedule.mode,startDate:value.startDate,endDate:value.endDate,weekdays:value.weekdays,weeks:'weeks' in schedule?schedule.weeks:null,children,entries:[...new Map(pending.map(p=>[p.child+':'+p.task.id,{childId:p.child,taskId:p.task.id,content:p.task.content}])).values()],counts:Object.fromEntries(actualChildren.map(id=>[id,pending.filter(p=>p.child===id).length]))};
        await run("INSERT INTO imports(id,family_id,child_ids,work_date,source_text,status,import_kind,allocation_rule) VALUES(?,?,?,?,?,'published','household',?)",[batch,req.session.family_id,JSON.stringify(actualChildren),value.startDate,tasks.map(t=>t.content).join('\n'),JSON.stringify(rule)],db);
        for(const {task,child,date} of pending)await run("INSERT INTO assignments(id,family_id,child_id,import_id,work_date,subject,content,due_date,materials,priority,priority_reason,household_task_id) VALUES(?,?,?,?,?,'家庭任务',?,?,'',?,'家庭安排',?)",[randomUUID(),req.session.family_id,child,batch,date,task.content,date,task.priority,task.id],db);
      }
      return {created:pending.length,skipped};
    });
  });
}
