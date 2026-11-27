export const SUBJECTS=['待确认','语文','数学','英语','科学','道德与法治','体育','美术','音乐','劳动','家庭任务','其他'];
export function subjectOptions(current:string){return SUBJECTS.includes(current)?SUBJECTS:[...SUBJECTS,current];}
