// Local UI-only test data. Never imported by the production API or Docker images.
import {createServer} from 'node:http';
const ids={child:'11111111-1111-4111-8111-111111111111',other:'22222222-2222-4222-8222-222222222222',job:'33333333-3333-4333-8333-333333333333'};
const tasks=[
  {id:'task-a',child_id:ids.child,subject:'数学',content:'完成练习册第12页第1—5题；写清计算过程，明天上交。',priority:'high',due_date:'2026-11-27',materials:'练习册、铅笔',work_date:'2026-11-26',completed:0,revision:1},
  {id:'task-b',child_id:ids.child,subject:'语文',content:'准备第8课生字听写，注意“辨”和“辩”的区别。',priority:'high',due_date:'2026-11-27',materials:'',work_date:'2026-11-26',completed:0,revision:1},
  {id:'task-c',child_id:ids.child,subject:'英语',content:'背诵第三单元课文，下周检查。',priority:'high',due_date:'2026-12-01',materials:'',work_date:'2026-11-26',completed:0,revision:1},
  {id:'task-d',child_id:ids.child,subject:'语文',content:'朗读第8课三遍，留意停顿和语气。',priority:'normal',due_date:null,materials:'',work_date:'2026-11-26',completed:0,revision:1},
  {id:'task-e',child_id:ids.child,subject:'科学',content:'阅读一篇自己感兴趣的科普文章。',priority:'normal',due_date:null,materials:'',work_date:'2026-11-25',completed:1,revision:1}
];
let job={id:ids.job,child_ids:[ids.child],work_date:'2026-11-26',source_text:'数学：练习册12页1—5题，明天交。语文：朗读第8课三遍，明天听写第8课生字。',status:'review',version:1,attachments:[],result:{items:[{subject:'数学',content:'完成练习册12页1—5题',priority:'high',priorityReason:'明天上交',dueDate:'2026-11-27',materials:'练习册',warning:''},{subject:'语文',content:'朗读第8课三遍',priority:'normal',priorityReason:'在家完成',dueDate:null,materials:'',warning:''}],notices:[]},billing:{budgetCny:.8,committedCny:.18,legacyUsageUnknown:false,attempts:[{model:'kimi-k3.1-pro',state:'settled',usage:{prompt_tokens:4000,completion_tokens:1880}}]}};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');let data='';for await(const part of req)data+=part;
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const parent=req.headers.authorization==='Bearer parent-preview';
  if(url.pathname==='/api/auth/login')return send({token:'parent-preview'});
  if(url.pathname==='/api/auth/pair')return send({token:'child-preview'});
  if(url.pathname==='/api/auth/logout')return send({ok:true});
  if(url.pathname==='/api/me')return send({role:parent?'parent':'child',child_id:null,aiConfigured:true});
  if(url.pathname==='/api/children')return send([{id:ids.child,name:'小明',grade:'三年级'},{id:ids.other,name:'小红',grade:'一年级'}]);
  if(url.pathname==='/api/assignments')return send(tasks.filter(t=>t.child_id===url.searchParams.get('childId')));
  if(url.pathname.endsWith('/complete')){const task=tasks.find(t=>url.pathname.includes(t.id));if(task)task.completed=JSON.parse(data).completed?1:0;return send({ok:true});}
  if(url.pathname.endsWith('/attachments'))return send([]);
  if(url.pathname==='/api/imports')return send(req.method==='POST'?{id:ids.job}:[job]);
  if(url.pathname==='/api/imports/'+ids.job){if(req.method==='PUT'){const body=JSON.parse(data);job={...job,result:body.result,version:job.version+1};}return send(job);}
  if(url.pathname==='/api/devices')return send([]);
  return send({message:'Fixture route unavailable'},404);
});
const port=Number(process.env.PREVIEW_FIXTURE_PORT??4310);
server.listen(port,'127.0.0.1',()=>console.log('UI TEST FIXTURE ONLY: http://127.0.0.1:'+port+' — no MySQL, no Kimi calls'));
