<script setup lang="ts">
import {ref,computed,onMounted} from 'vue';
import {api,dateToday} from './api';
const props=defineProps<{children:{id:string;name:string}[]}>();
const tasks=ref<any[]>([]),taskIds=ref<string[]>([]),childIds=ref<string[]>([]),content=ref(''),priority=ref('normal'),editing=ref<any>(null),busy=ref(false),error=ref(''),notice=ref('');
const startDate=ref(dateToday()),endDate=ref(dateToday()),weekdays=ref([1,2,3,4,5,6,7]);
const week=['一','二','三','四','五','六','日'];
const preview=computed(()=>{let count=0;const first=Date.parse(startDate.value+'T00:00:00Z'),last=Date.parse(endDate.value+'T00:00:00Z');if(!Number.isFinite(first)||!Number.isFinite(last)||last<first||last-first>365*86400000)return 0;for(let date=first;date<=last;date+=86400000)if(weekdays.value.includes(new Date(date).getUTCDay()||7))count++;return count*taskIds.value.length*childIds.value.length;});
async function act(fn:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await fn();}catch(e){error.value=e instanceof Error?e.message:'操作失败';}finally{busy.value=false;}}
async function load(){tasks.value=await api('/household-tasks');taskIds.value=taskIds.value.filter(id=>tasks.value.some(t=>t.id===id));}
function reset(){editing.value=null;content.value='';priority.value='normal';}
async function save(){await act(async()=>{const body={content:content.value,priority:priority.value,...(editing.value?{revision:editing.value.revision}:{})};await api('/household-tasks'+(editing.value?'/'+editing.value.id:''),{method:editing.value?'PUT':'POST',body:JSON.stringify(body)});reset();await load();notice.value='清单已保存，已分配任务保持不变';});}
function edit(task:any){editing.value=task;content.value=task.content;priority.value=task.priority;}
async function remove(task:any){if(!confirm('从家庭清单移除？已经分配的任务和完成记录保留。'))return;await act(async()=>{await api('/household-tasks/'+task.id,{method:'DELETE',body:JSON.stringify({revision:task.revision})});if(editing.value?.id===task.id)reset();await load();});}
async function assign(){await act(async()=>{const result=await api('/household-tasks/assign',{method:'POST',body:JSON.stringify({taskIds:taskIds.value,childIds:childIds.value,startDate:startDate.value,endDate:endDate.value,weekdays:weekdays.value})});notice.value=`已分配 ${result.created} 项，跳过已有 ${result.skipped} 项。可返回作业页按日期查看。`;});}
onMounted(()=>act(load));
</script>

<template>
 <section class="household-workspace">
  <h2>家庭任务清单</h2><p class="muted small">维护弹钢琴、跳绳等日常要求，再按日期分配给孩子。</p>
  <p v-if="error" class="error" role="alert">{{error}}</p><p v-if="notice" class="success" role="status">{{notice}}</p>
  <form class="panel" @submit.prevent="save"><h3>{{editing?'修改清单任务':'新增清单任务'}}</h3><label>任务要求<textarea v-model="content" rows="2" maxlength="3000" required placeholder="例如：弹钢琴20分钟"></textarea></label><label>优先级<select v-model="priority"><option value="normal">普通任务</option><option value="high">优先任务</option></select></label><button class="primary" :disabled="busy||!content.trim()">保存到清单</button><button v-if="editing" type="button" class="quiet" :disabled="busy" @click="reset">取消修改</button></form>
  <div class="panel"><h3>选择要分配的任务</h3><p v-if="!tasks.length" class="muted">请先新增一项家庭任务。</p><article v-for="task in tasks" :key="task.id" class="household-template"><label class="check"><input v-model="taskIds" type="checkbox" :value="task.id" :disabled="busy"><span class="assignment-text">{{task.content}}</span></label><div class="card-actions"><span v-if="task.priority==='high'" class="priority-label">优先</span><button class="quiet" :disabled="busy" @click="edit(task)">修改</button><button class="quiet danger" :disabled="busy" @click="remove(task)">移除</button></div></article></div>
  <section class="panel"><h3>分配到日期</h3><fieldset><legend>孩子</legend><label v-for="child in props.children" :key="child.id" class="check"><input v-model="childIds" type="checkbox" :value="child.id" :disabled="busy">{{child.name}}</label></fieldset><div class="toolbar"><label>开始日期<input v-model="startDate" type="date" :disabled="busy"></label><label>结束日期<input v-model="endDate" type="date" :min="startDate" :disabled="busy"></label></div><fieldset><legend>每周执行日期</legend><label v-for="(day,index) in week" :key="day" class="check"><input v-model="weekdays" type="checkbox" :value="index+1" :disabled="busy">周{{day}}</label></fieldset><p class="muted small">预计 {{preview}} 项。重复分配跳过已有任务；修改清单不影响已分配内容，移除清单也保留完成记录。孩子端在对应日期显示，过期未完成仍保留。</p></section>
  <div class="bottom-dock"><button class="primary wide" :disabled="busy||!preview||preview>2000" @click="assign">{{busy?'处理中…':'分配到日期（'+preview+'项）'}}</button></div>
 </section>
</template>

<style scoped>
.household-workspace{padding-bottom:calc(110px + env(safe-area-inset-bottom))}.household-template{border-top:1px solid #e1e8e2;padding:12px 0}.household-template .check{align-items:flex-start;width:100%;margin:0}.household-template input{flex-shrink:0;margin-top:9px}.household-template .assignment-text{font-size:17px;min-width:0}.household-template .card-actions{margin-top:4px}.panel h3{margin:0 0 12px}
</style>
