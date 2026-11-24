import {seed} from './seed.js';
export class ApiRepository {
 constructor(session){this.session=session;this.revision=0;this.current=null;this.queue=Promise.resolve();this.failed=false;}
 async init(){const r=await fetch('/api/state');if(!r.ok)throw new Error('Не удалось загрузить карту');const body=await r.json();this.revision=body.revision;this.current=body.data;return this;}
 load(){return structuredClone(this.current);}
 status(state,message=''){window.dispatchEvent(new CustomEvent('cursor:sync',{detail:{state,message}}));}
 save(data){const snapshot=structuredClone(data);this.current=snapshot;this.status('saving');this.queue=this.queue.then(async()=>{
   if(this.failed)return;
   try{const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':this.session.csrf},body:JSON.stringify({revision:this.revision,data:snapshot})});const body=await r.json();if(!r.ok)throw new Error(typeof body.detail==='string'?body.detail:'Сервер отклонил изменения');this.revision=body.revision;this.status('saved');}
   catch(error){this.failed=true;this.status('error',error.message+' Дальнейшая запись остановлена. Скачайте правки перед обновлением страницы.');}
 });return this.queue;}
 reset(){const data=structuredClone(seed);this.save(data);return data;}
}
