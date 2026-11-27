import {day,resultSchema,type Draft,HttpError} from './domain.js';

const marker=/^\s*(?:\d{1,3}[.、．)）](?!\d)|[-*•])\s*/;
const subjects=['语文','数学','英语','科学','道德与法治','体育','美术','音乐','劳动'];
const heading=new RegExp('^('+subjects.join('|')+')(?:作业[：:]?|[：:])$');
export function manualTasks(text:string,workDate:string):Draft {
  day.parse(workDate);
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length)throw new HttpError(400,'请填写任务内容');
  const sections:{subject:string|null;lines:string[]}[]=[{subject:null,lines:[]}];
  for(const line of lines){const match=line.match(heading);if(match)sections.push({subject:match[1],lines:[]});else sections[sections.length-1].lines.push(line);}
  const parts:{subject:string|null;content:string}[]=[];
  for(const section of sections){
    const numbered=section.lines.some(l=>marker.test(l));const tasks:string[]=[];
    for(const line of section.lines){if(!numbered||marker.test(line)||!tasks.length)tasks.push(line.replace(marker,''));else tasks[tasks.length-1]+='\n'+line;}
    parts.push(...tasks.map(content=>({subject:section.subject,content})));
  }
  if(!parts.length)throw new HttpError(400,'请在学科标题下填写任务内容');
  if(parts.length>100)throw new HttpError(400,'一次最多100项任务，请分批录入');
  const items=parts.map(({content,subject:sectionSubject})=>{
    const explicit=subjects.filter(s=>content.includes(s));
    let subject=sectionSubject??(explicit.length===1?explicit[0]:'待确认');
    if(!sectionSubject&&!explicit.length){
      const matches=[['语文',/古诗|默写|小练笔|作文|朗读|背诵|课文|生字|拼音/],['英语',/单词|英文|English/i],['数学',/口算|竖式|方程|几何|算式/]] as const;
      const found=matches.filter(([,rx])=>rx.test(content));if(found.length===1)subject=found[0][0];
    }
    const action=[...content.matchAll(/上交|提交|检查|听写|默写/g)].find(m=>!/(?:不(?!仅|但)|不用|无需|不必|不需|不需要|不要)[^，。；！？\n]{0,6}$/.test(content.slice(Math.max(0,m.index!-10),m.index)));
    let dueDate:string|null=null;let warning=subject==='待确认'?'无法按规则确定学科，请家长选择':'';
    const explicitDate=content.match(/\b(\d{4}-\d{1,2}-\d{1,2})\b/);
    if(explicitDate){const [y,m,d]=explicitDate[1].split('-');const candidate=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;if(day.safeParse(candidate).success)dueDate=candidate;else warning+=' 日期无效，请核对';}
    else{const relative=content.match(/今天|今日|明天|明日|后天/);if(relative){const shift=/明天|明日/.test(relative[0])?1:relative[0]==='后天'?2:0;const date=new Date(workDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+shift);dueDate=date.toISOString().slice(0,10);}}
    return {subject,content,priority:action?'high' as const:'normal' as const,priorityReason:action?'包含'+action[0]+'要求':'',dueDate,materials:'',warning:warning.trim()};
  });
  return resultSchema.parse({items,notices:[]});
}
