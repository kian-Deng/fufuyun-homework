import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractText,parseResult,day,today} from '../src/domain.js';
test('AI output validates and preserves uncertainty',()=>{const d=parseResult('{"items":[{"subject":"数学","content":"练习册第5页","warning":"页码需确认"}]}');assert.equal(d.items[0].dueDate,null);assert.equal(d.items[0].warning,'页码需确认');assert.deepEqual(d.notices,[]);});
test('reject invalid or excessively large model output',()=>{assert.throws(()=>parseResult('{"items":[{"subject":"","content":""}]}'));assert.throws(()=>parseResult('```json\n{}\n```'));});
test('validate calendar dates including leap days',()=>{assert.equal(day.parse('2024-02-29'),'2024-02-29');assert.throws(()=>day.parse('2026-02-29'));assert.throws(()=>day.parse('2026-13-01'));assert.match(today(),/^\d{4}-\d{2}-\d{2}$/);});
test('text and explicit JSON export format',()=>{assert.equal(extractText('消息.txt',Buffer.from('\uFEFF数学作业')),'数学作业');assert.equal(extractText('消息.json',Buffer.from('{"messages":[{"text":"语文"},{"text":"数学"}]}')),'语文\n数学');assert.throws(()=>extractText('聊天.zip',Buffer.from('x')));assert.throws(()=>extractText('消息.json',Buffer.from('{"unknown":1}')));});
