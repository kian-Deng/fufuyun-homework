export type Task={id:string;priority?:string;due_date?:string|null;work_date:string;created_at?:string;completed:number|boolean;subject:string;content:string;materials?:string;updated?:number|boolean;revision:number};
export function sortTasks<T extends Task>(items:T[]):T[]{
  return [...items].sort((a,b)=>{
    const group=Number(Boolean(a.completed))-Number(Boolean(b.completed));
    if(group)return group;
    const priority=Number(b.priority==='high')-Number(a.priority==='high');
    if(priority)return priority;
    const date=(a.due_date??'9999-12-31').localeCompare(b.due_date??'9999-12-31');
    return date||a.work_date.localeCompare(b.work_date)||(a.created_at??'').localeCompare(b.created_at??'')||a.id.localeCompare(b.id);
  });
}
