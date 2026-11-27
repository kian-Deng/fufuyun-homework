import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocationDates} from '../src/household.js';
test('household date allocation includes boundaries and selected weekdays across months',()=>{
 assert.deepEqual(allocationDates('2026-11-23','2026-11-29',[1,3,5]),['2026-11-23','2026-11-25','2026-11-27']);
 assert.deepEqual(allocationDates('2026-12-31','2027-01-02',[4,5,6]),['2026-12-31','2027-01-01','2027-01-02']);
 assert.deepEqual(allocationDates('2028-02-28','2028-03-01',[1,2,3,4,5,6,7]),['2028-02-28','2028-02-29','2028-03-01']);
 assert.deepEqual(allocationDates('2026-11-29','2026-11-29',[7]),['2026-11-29']);
 assert.throws(()=>allocationDates('2026-11-29','2026-11-23',[1]),/日期范围/);
 assert.throws(()=>allocationDates('2026-11-23','2028-11-23',[1]),/366/);
 assert.throws(()=>allocationDates('2026-11-23','2026-11-23',[7]),/没有所选星期/);
 assert.throws(()=>allocationDates('2026-11-23','2026-11-23',[]));
 assert.throws(()=>allocationDates('2026-11-23','2026-11-23',[0]));
});
