import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocationDates,scheduleDates} from '../src/household.js';
test('period and weekly schedules are mutually exclusive, including stale hidden fields',()=>{
 const period=scheduleDates({mode:'range',startDate:'2026-11-23',endDate:'2026-11-25'});
 assert.deepEqual(period.dates,['2026-11-23','2026-11-24','2026-11-25']);
 const weekly=scheduleDates({mode:'weekly',startDate:'2026-11-23',weeks:2,weekdays:[1,5]});
 assert.deepEqual(weekly.dates,['2026-11-23','2026-11-27','2026-11-30','2026-12-04']);assert.equal(weekly.endDate,'2026-12-06');
 assert.throws(()=>scheduleDates({mode:'range',startDate:'2026-11-23',endDate:'2026-11-25',weekdays:[1]}));
 assert.throws(()=>scheduleDates({mode:'weekly',startDate:'2026-11-23',endDate:'2026-11-25',weeks:2,weekdays:[1]}));
 assert.throws(()=>scheduleDates({mode:'weekly',startDate:'2026-11-23',weeks:0,weekdays:[1]}));
 assert.throws(()=>scheduleDates({mode:'weekly',startDate:'2026-11-23',weeks:53,weekdays:[1]}));
 assert.throws(()=>scheduleDates({mode:'weekly',startDate:'2026-11-23',weeks:2,weekdays:[1,1]}));
 assert.equal(scheduleDates({startDate:'2026-11-23',endDate:'2026-11-29',weekdays:[1,3,5]}).mode,'legacy');
});
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
