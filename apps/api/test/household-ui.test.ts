import {test} from 'node:test';
import assert from 'node:assert/strict';

test('mobile publish flow starts at history and sends only the active schedule fields',async()=>{
 const root=globalThis as any,oldPage=root.Page,oldWx=root.wx;let definition:any;const requests:any[]=[],errors:any[]=[];
 try{
  root.Page=(value:any)=>{definition=value;};
  root.wx={getStorageSync:()=> 'test-only',request:(request:any)=>{requests.push(request);request.success({statusCode:200,data:{created:2,skipped:0}});},showModal:(value:any)=>errors.push(value)};
  await import('../../miniprogram/pages/household/index.ts');
  const page={...definition,data:structuredClone(definition.data),setData(values:any){Object.assign(this.data,values);},async dismiss(){this.data.sheet='';},async loadPublications(){},notify(value:string){this.data.notice=value;}};
  assert.equal(page.data.tab,'published');assert.equal(page.data.sheet,'');
  page.data.taskIds=['task'];page.data.childIds=['child'];page.data.startDate='2026-11-23';page.data.endDate='2026-11-25';page.data.mode='range';page.data.weeks=9;page.data.weekdays=[1];
  page.count();assert.equal(page.data.preview,3);
  await page.assign();assert.deepEqual(requests[0].data,{taskIds:['task'],childIds:['child'],mode:'range',startDate:'2026-11-23',endDate:'2026-11-25'});assert.equal(page.data.tab,'published');
  page.data.mode='weekly';page.data.weeks=2;page.data.weekdays=[1,5];page.data.endDate='2099-01-01';
  page.count();assert.equal(page.data.preview,4);
  await page.assign();assert.deepEqual(requests[1].data,{taskIds:['task'],childIds:['child'],mode:'weekly',startDate:'2026-11-23',weeks:2,weekdays:[1,5]});assert.deepEqual(errors,[]);
 }finally{root.Page=oldPage;root.wx=oldWx;}
});
