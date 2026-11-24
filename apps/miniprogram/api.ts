import {API_BASE_URL} from './config';
export function api(path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',data?:any):Promise<any>{return new Promise((resolve,reject)=>{wx.request({url:API_BASE_URL+path,method,data,header:{Authorization:`Bearer ${wx.getStorageSync('token')||''}`},success:r=>{if(r.statusCode>=200&&r.statusCode<300)resolve(r.data);else{if(r.statusCode===401){wx.removeStorageSync('token');wx.reLaunch({url:'/pages/login/index'});}reject(new Error((r.data as any)?.message||'请求失败'));}},fail:()=>reject(new Error('无法连接服务器，请检查网络'))});});}
export function report(e:any){wx.showModal({title:'操作未完成',content:e.message||'请稍后重试',showCancel:false});}
export function today(){const d=new Date(Date.now()+8*3600000);return d.toISOString().slice(0,10);}
function utf8(s:string){const value=unescape(encodeURIComponent(s));return Uint8Array.from(value,c=>c.charCodeAt(0));}
export function upload(text:string,workDate:string,childIds:string[],files:{path:string;name:string}[]):Promise<any>{
 const boundary='Fufuyun'+Date.now();const chunks:Uint8Array[]=[];const add=(s:string)=>chunks.push(utf8(s));
 for(const [key,value] of Object.entries({text,workDate,childIds:JSON.stringify(childIds)}))add(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`);
 const fs=wx.getFileSystemManager();for(const file of files){const name=file.name.replace(/["\r\n\\]/g,'_');add(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`);chunks.push(new Uint8Array(fs.readFileSync(file.path) as ArrayBuffer));add('\r\n');}add(`--${boundary}--\r\n`);
 const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return new Promise((resolve,reject)=>wx.request({url:API_BASE_URL+'/imports',method:'POST',data:bytes.buffer,timeout:60000,header:{Authorization:`Bearer ${wx.getStorageSync('token')||''}`,'Content-Type':`multipart/form-data; boundary=${boundary}`},success:r=>r.statusCode===200?resolve(r.data):reject(new Error((r.data as any)?.message||'导入失败')),fail:()=>reject(new Error('上传失败，请检查网络'))}));
}
