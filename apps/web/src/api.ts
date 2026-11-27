export const FAMILY_STORAGE_KEY='homework_family_access';
export function isFamilyEntry(path=window.location.pathname){return /^\/child\/?$/.test(path);}
export function familyTokenFromHash(hash:string){const value=new URLSearchParams(hash.replace(/^#/,'' )).get('access');return value&&/^family_[A-Za-z0-9_-]{43}$/.test(value)?value:null;}
export function initializeFamilyEntry(){const params=new URLSearchParams(window.location.hash.replace(/^#/,''));if(params.has('access')){const token=familyTokenFromHash(window.location.hash);if(token)localStorage.setItem(FAMILY_STORAGE_KEY,token);else localStorage.removeItem(FAMILY_STORAGE_KEY);}return !!localStorage.getItem(FAMILY_STORAGE_KEY);}
export function tokenStorageKey(){return isFamilyEntry()?FAMILY_STORAGE_KEY:'homework_token';}
function authToken(){return localStorage.getItem(tokenStorageKey())??'';}
export async function api(path:string,init:RequestInit={}) {const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${authToken()}`);if(init.body&&!(init.body instanceof FormData))headers.set('Content-Type','application/json');const r=await fetch(`/api${path}`,{...init,headers});if(!r.ok){if(r.status===401){localStorage.removeItem(tokenStorageKey());window.dispatchEvent(new Event('session-expired'));}const e=await r.json().catch(()=>({}));throw new Error(e.message??'请求失败');}return r.json();}
export async function attachment(id:string){const r=await fetch(`/api/attachments/${id}`,{headers:{Authorization:`Bearer ${authToken()}`}});if(!r.ok)throw new Error('附件加载失败');return URL.createObjectURL(await r.blob());}
export function dateToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
