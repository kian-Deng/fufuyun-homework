import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUDGET_MICROS,checkAllowance,priceFor,reserveCost,usageCost,validateUsage} from '../src/budget.js';
test('price and budget rules use micro-CNY and conservative reservations',()=>{
 const p=priceFor('kimi-k3.1-pro');
 assert.equal(usageCost({prompt_tokens:4000,completion_tokens:1000,prompt_tokens_details:{cached_tokens:1000,cache_write_tokens:1000},completion_tokens_details:{reasoning_tokens:700}},p),108300);
 assert.ok(reserveCost(8000,p)<BUDGET_MICROS);
 assert.throws(()=>reserveCost(8001,p),/8000/);
 assert.throws(()=>reserveCost(NaN,p));
 assert.throws(()=>priceFor('unknown'),/价格配置/);
 assert.throws(()=>checkAllowance(2,1,1),/两次/);
 assert.throws(()=>checkAllowance(1,799999,2),/预算/);
 assert.doesNotThrow(()=>checkAllowance(1,1000,1000));
});
test('untrustworthy usage is never treated as zero-cost',()=>{
 for(const value of [undefined,{}, {prompt_tokens:-1,completion_tokens:0},{prompt_tokens:10,completion_tokens:1,prompt_tokens_details:{cached_tokens:11}},{prompt_tokens:1.5,completion_tokens:2}])assert.equal(validateUsage(value),null);
 assert.ok(validateUsage({prompt_tokens:100,completion_tokens:20}));
});
