import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseGeneratedResult,parseResult} from '../src/domain.js';
import {sortTasks,subjectCounts,filterTasks} from '../../web/src/tasks.ts';
import {SYSTEM_PROMPT} from '../src/prompt.js';

test('only identical generated items are removed; distinct actions and metadata survive',()=>{
 const poem={subject:'语文',content:'复习并默写第1、2、3、8单元所有古诗（明天检查）',priority:'high',dueDate:'2026-11-28'};
 const items=[poem,{...poem},{...poem,materials:'默写本'},{...poem,content:'提交古诗抄写照片'}];
 const raw=JSON.stringify({items});
 assert.equal(parseGeneratedResult(raw).items.length,3);
 assert.equal(parseResult(raw).items.length,4,'historical/manual drafts must not be rewritten');
 assert.match(SYSTEM_PROMPT,/不按动词拆/);assert.match(SYSTEM_PROMPT,/明天检查/);assert.match(SYSTEM_PROMPT,/独立成果/);assert.match(SYSTEM_PROMPT,/否定/);
});

test('subject counts include zero-pending completed subjects, and filtering preserves completion state',()=>{
 const task=(id:string,subject:string,completed=false)=>({id,subject,completed,content:id,work_date:'2026-11-27',revision:1});
 const tasks=[task('a','语文'),task('b','数学'),task('c','语文',true),task('d','英语',true)];
 assert.deepEqual(subjectCounts(tasks),[{subject:'语文',pending:1},{subject:'数学',pending:1},{subject:'英语',pending:0}]);
 assert.deepEqual(filterTasks(tasks,'语文').map(t=>t.id),['a','c']);
 assert.deepEqual(filterTasks(tasks,''),tasks);assert.deepEqual(filterTasks(tasks,'科学'),[]);
});
test('legacy tasks remain compatible; generated tasks require an explicit priority',()=>{
 const old='{"items":[{"subject":"语文","content":"朗读"}]}';
 assert.equal(parseResult(old).items[0].priority,'normal');
 assert.throws(()=>parseGeneratedResult(old));
 const result=parseGeneratedResult('{"items":[{"subject":"语文","content":"准备下周检查背诵","priority":"high"}]}');
 assert.equal(result.items[0].dueDate,null);assert.equal(result.items[0].priority,'high');
});
test('subject tabs prioritize Chinese, math and English, retaining the order of other subjects',()=>{
 const tasks=['科学','英语','美术','数学','语文'].map((subject,index)=>({id:String(index),subject,completed:false,content:subject,work_date:'2026-11-27',revision:1}));
 assert.deepEqual(subjectCounts(tasks).map(t=>t.subject),['语文','数学','英语','科学','美术']);
 assert.deepEqual(tasks.map(t=>t.subject),['科学','英语','美术','数学','语文']);
});
test('priority tasks come first, with overdue and nearest dates before future or unknown dates',()=>{
 const task=(id:string,priority:string,due_date:string|null,completed=false)=>({id,priority,due_date,completed,subject:'语文',content:id,work_date:'2026-11-26',revision:1});
 const input=[task('normal','normal','2026-11-20'),task('unknown','high',null),task('future','high','2026-12-01'),task('done','high','2026-11-20',true),task('tomorrow','high','2026-11-27'),task('overdue','high','2026-11-25')];
 assert.deepEqual(sortTasks(input).map(t=>t.id),['overdue','tomorrow','future','unknown','normal','done']);
 assert.equal(input[0].id,'normal');
});
