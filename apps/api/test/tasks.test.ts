import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseGeneratedResult,parseResult} from '../src/domain.js';
import {sortTasks} from '../../web/src/tasks.ts';
test('legacy tasks remain compatible; generated tasks require an explicit priority',()=>{
 const old='{"items":[{"subject":"语文","content":"朗读"}]}';
 assert.equal(parseResult(old).items[0].priority,'normal');
 assert.throws(()=>parseGeneratedResult(old));
 const result=parseGeneratedResult('{"items":[{"subject":"语文","content":"准备下周检查背诵","priority":"high"}]}');
 assert.equal(result.items[0].dueDate,null);assert.equal(result.items[0].priority,'high');
});
test('priority tasks come first, with overdue and nearest dates before future or unknown dates',()=>{
 const task=(id:string,priority:string,due_date:string|null,completed=false)=>({id,priority,due_date,completed,subject:'语文',content:id,work_date:'2026-11-26',revision:1});
 const input=[task('normal','normal','2026-11-20'),task('unknown','high',null),task('future','high','2026-12-01'),task('done','high','2026-11-20',true),task('tomorrow','high','2026-11-27'),task('overdue','high','2026-11-25')];
 assert.deepEqual(sortTasks(input).map(t=>t.id),['overdue','tomorrow','future','unknown','normal','done']);
 assert.equal(input[0].id,'normal');
});
