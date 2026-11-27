import {day,resultSchema,type Draft,HttpError} from './domain.js';

const subjects=['语文','数学','英语','科学','道德与法治','体育','美术','音乐','劳动'];
export function manualTasks(text:string,workDate:string):Draft {
  day.parse(workDate);
  if(!text.trim())throw new HttpError(400,'请填写任务内容');
  if(text.length>3000)throw new HttpError(400,'直接录入整段最多3000字，不会自动拆分；请缩短内容或选择 Kimi 整理');
  const content=text;
  const explicit=subjects.filter(s=>content.includes(s));
  let subject=explicit.length===1?explicit[0]:'待确认';
  if(!explicit.length){
    const matches=[['语文',/古诗|默写|小练笔|作文|朗读|背诵|课文|生字|拼音/],['英语',/单词|英文|English/i],['数学',/口算|竖式|方程|几何|算式/]] as const;
    const found=matches.filter(([,rx])=>rx.test(content));if(found.length===1)subject=found[0][0];
  }
  const action=[...content.matchAll(/上交|提交|检查|听写|默写/g)].find(m=>!/(?:不(?!仅|但)|不用|无需|不必|不需|不需要|不要)[^，。；！？\n]{0,6}$/.test(content.slice(Math.max(0,m.index!-10),m.index)));
  let dueDate:string|null=null;let warning=subject==='待确认'?'无法按规则确定学科，请家长选择':'';
  const explicitDate=content.match(/\b(\d{4}-\d{1,2}-\d{1,2})\b/);
  if(explicitDate){const [y,m,d]=explicitDate[1].split('-');const candidate=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;if(day.safeParse(candidate).success)dueDate=candidate;else warning+=' 日期无效，请核对';}
  else{const relative=content.match(/今天|今日|明天|明日|后天/);if(relative){const shift=/明天|明日/.test(relative[0])?1:relative[0]==='后天'?2:0;const date=new Date(workDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+shift);dueDate=date.toISOString().slice(0,10);}}
  return resultSchema.parse({items:[{subject,content,priority:action?'high':'normal',priorityReason:action?'包含'+action[0]+'要求':'',dueDate,materials:'',warning:warning.trim()}],notices:[]});
}
