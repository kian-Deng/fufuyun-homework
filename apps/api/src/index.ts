import {buildApp} from './app.js';
import {migrate,pool} from './db.js';
import {startWorker,stopWorker} from './worker.js';
const app=buildApp();
try {if(!process.env.DB_USER||!process.env.DB_PASSWORD)throw new Error('Configure DB_USER and DB_PASSWORD');if(!process.env.PARENT_PASSWORD||process.env.PARENT_PASSWORD.length<12)throw new Error('PARENT_PASSWORD must contain at least 12 characters');await migrate();await app.listen({port:Number(process.env.PORT??3100),host:'0.0.0.0'});await startWorker(e=>app.log.error(e));}catch(e){app.log.error(e);await app.close();await pool.end();process.exit(1);}
let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(closing)return;closing=true;await stopWorker();await app.close();await pool.end();});
