<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {sortTasks,subjectCounts,filterTasks,type Task} from './tasks';
const props=defineProps<{tasks:Task[];busy:boolean;name:string}>();
const emit=defineEmits<{toggle:[task:Task];details:[task:Task]}>();
const expanded=ref(false);
const subject=ref('');
watch(()=>props.name,()=>{subject.value='';expanded.value=false;});
const subjects=computed(()=>subjectCounts(props.tasks));
watch(subjects,values=>{if(subject.value&&!values.some(s=>s.subject===subject.value))subject.value='';});
const sorted=computed(()=>sortTasks(filterTasks(props.tasks,subject.value)));
const sections=computed(()=>[
  {key:'high',title:'优先处理',items:sorted.value.filter(t=>!t.completed&&t.priority==='high')},
  {key:'normal',title:'其他任务',items:sorted.value.filter(t=>!t.completed&&t.priority!=='high')}
]);
const finished=computed(()=>sorted.value.filter(t=>t.completed));
const pending=computed(()=>props.tasks.filter(t=>!t.completed).length);
</script>

<template>
 <div class="child-task-heading"><span>{{pending?'还有 '+pending+' 项未完成':'未完成任务已清空'}}</span></div>
 <div class="subject-filters no-print" role="group" aria-label="筛选学科"><button :aria-pressed="subject===''" :class="{active:subject===''}" @click="subject=''">全部 {{pending}}</button><button v-for="s in subjects" :key="s.subject" :aria-pressed="subject===s.subject" :class="{active:subject===s.subject}" @click="subject=s.subject">{{s.subject}} {{s.pending}}</button></div>
 <section v-for="section in sections" :key="section.key" class="child-task-section" :class="{'priority-section':section.key==='high'}">
  <h2>{{section.title}} <small>{{section.items.length}} 项</small></h2>
  <p v-if="!section.items.length" class="child-empty">{{section.key==='high'?'优先任务都完成了，看看下面还有什么。':'暂无其他任务。'}}</p>
  <article v-for="task in section.items" :key="task.id" class="child-task-row">
   <button class="child-check" :aria-label="'完成：'+task.content" :aria-pressed="false" :disabled="busy" @click="emit('toggle',task)"></button>
   <div class="child-task-copy"><span class="badge">{{task.subject}}</span><span v-if="task.updated" class="update-label">内容有更新</span><p>{{task.content}}</p><span v-if="task.materials" class="muted">准备：{{task.materials}}</span><span v-if="task.due_date" class="child-due">截止 {{task.due_date}}</span><button class="quiet small no-print" @click="emit('details',task)">详情 / 附件</button></div>
  </article>
 </section>
 <section class="child-finished"><button class="quiet no-print" :aria-expanded="expanded" @click="expanded=!expanded">已完成（{{finished.length}}） · {{expanded?'收起':'展开'}}</button><div v-if="expanded"><article v-for="task in finished" :key="task.id" class="child-task-row completed"><button class="child-check checked" :aria-label="'取消完成：'+task.content" :aria-pressed="true" :disabled="busy" @click="emit('toggle',task)">✓</button><div class="child-task-copy"><span class="badge">{{task.subject}}</span><p>{{task.content}}</p></div></article><p v-if="!finished.length" class="muted">暂时还没有已完成任务。</p></div></section>
</template>
