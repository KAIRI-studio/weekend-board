const transferSettings=['castor-weekend-theme','castor-weekend-theme-key'];
const transferStatus=message=>$('#transferStatus').textContent=message;
const blobToDataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)});
let pendingTransfer=null;
function validateTransfer(value){
 if(!value||value.app!=='castor-weekend-board'||value.formatVersion!==1||!value.data||!/^\d{4}-\d{2}-\d{2}$/.test(value.data.week)||!Array.isArray(value.data.tasks)||value.data.tasks.length>5000||!Array.isArray(value.photos)||value.photos.length>200)throw new Error('WEEKENDの引き継ぎファイルを選んでください');
 const ids=new Set();
 const tasks=value.data.tasks.map(t=>{if(!t||!((typeof t.id==='number'&&Number.isFinite(t.id))||(typeof t.id==='string'&&t.id.length>0&&t.id.length<200))||ids.has(String(t.id))||typeof t.name!=='string'||!t.name.trim()||t.name.length>1000||!['routine','project'].includes(t.type)||typeof t.done!=='boolean')throw new Error('ミッションのデータが正しくありません');ids.add(String(t.id));return {id:t.id,name:t.name,type:t.type,done:t.done}});
 const photoIds=new Set();
 const photos=value.photos.map(p=>{if(!p||typeof p.id!=='string'||!p.id||p.id.length>200||photoIds.has(p.id)||typeof p.name!=='string'||p.name.length>1000||!Number.isFinite(p.position)||p.position<0||p.position>100||!Number.isFinite(p.createdAt)||typeof p.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.image))throw new Error('背景写真のデータが正しくありません');photoIds.add(p.id);const [head,body]=p.image.split(',');let bytes;try{bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0))}catch{throw new Error('背景写真を読み込めません')};return {id:p.id,name:p.name,position:p.position,createdAt:p.createdAt,blob:new Blob([bytes],{type:head.slice(5,head.indexOf(';'))})}});
 const settings={};for(const setting of transferSettings){const v=value.settings?.[setting];if(v!==undefined&&v!==null){if(typeof v!=='string'||v.length>300)throw new Error('背景設定のデータが正しくありません');settings[setting]=v}}
 return {data:{week:value.data.week,tasks},photos,settings};
}
async function exportTransfer(){
 const button=$('#transferSave');button.disabled=true;transferStatus('記録と背景写真をまとめています…');
 try{const photos=await getPhotos();const settings={};for(const setting of transferSettings)settings[setting]=localStorage.getItem(setting);const payload={app:'castor-weekend-board',formatVersion:1,exportedAt:new Date().toISOString(),data:JSON.parse(JSON.stringify(data)),settings,photos:await Promise.all(photos.map(async p=>({id:p.id,name:p.name||'MY PHOTO',position:Number.isFinite(p.position)?p.position:50,createdAt:p.createdAt,image:await blobToDataURL(p.blob)})))};const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});if(blob.size>100*1024*1024)throw new Error('写真の容量が大きすぎます。不要な背景写真を減らしてください');const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`weekend-backup-${dateKey(new Date())}.json`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);transferStatus('保存ファイルを、新しいアイコンで開いたWEEKENDに読み込んでください。元のアイコンはまだ残してください。')}
 catch(error){transferStatus(error.message||'保存できませんでした。もう一度お試しください')}
 finally{button.disabled=false}
}
async function importTransfer(record){
 // Keep both stores recoverable until every write succeeds.
 const storageKeys=[key,backupKey,...transferSettings,recoveryKey,saturdayCycleKey];const before=new Map(storageKeys.map(k=>[k,localStorage.getItem(k)]));const oldPhotos=await getPhotos();let photosWritten=false;
 try{await photoStore('readwrite',store=>{store.clear();record.photos.forEach(p=>store.put(p))});photosWritten=true;for(const setting of transferSettings){if(record.settings[setting]!=null)localStorage.setItem(setting,record.settings[setting]);else localStorage.removeItem(setting)};localStorage.setItem(backupKey,before.get(key)||JSON.stringify(record.data));localStorage.setItem(key,JSON.stringify(record.data));localStorage.setItem(recoveryKey,'1');localStorage.setItem(saturdayCycleKey,'1')}
 catch(error){for(const [k,v] of before){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch{}}if(photosWritten)await photoStore('readwrite',store=>{store.clear();oldPhotos.forEach(p=>store.put(p))});throw error}
 data=record.data;currentThemeKey=record.settings['castor-weekend-theme-key']||`static-${record.settings['castor-weekend-theme']||0}`;render();await loadCustomThemes(currentThemeKey);
}
$('#transferSave').onclick=exportTransfer;
$('#transferLoad').onclick=()=>$('#transferFile').click();
$('#transferFile').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;transferStatus('ファイルを確認しています…');try{if(file.size>100*1024*1024)throw new Error('ファイルが大きすぎます');pendingTransfer=validateTransfer(JSON.parse(await file.text()));$('#transferPreview').textContent=`ミッション ${pendingTransfer.data.tasks.length}件（完了 ${pendingTransfer.data.tasks.filter(t=>t.done).length}件）・背景写真 ${pendingTransfer.photos.length}枚`;$('#transferConfirmDialog').showModal();transferStatus('内容を確認してから読み込んでください')}catch(error){pendingTransfer=null;transferStatus(error instanceof SyntaxError?'WEEKENDの引き継ぎファイルを選んでください':error.message)}};
$('#transferCancel').onclick=()=>{pendingTransfer=null;$('#transferConfirmDialog').close();transferStatus('読み込みをキャンセルしました。記録は変更していません')};
$('#transferConfirmDialog').addEventListener('cancel',()=>{pendingTransfer=null;transferStatus('読み込みをキャンセルしました。記録は変更していません')});
$('#transferConfirm').onclick=async()=>{if(!pendingTransfer)return;const button=$('#transferConfirm');button.disabled=true;$('#transferCancel').disabled=true;transferStatus('記録を読み込んでいます…');try{await importTransfer(pendingTransfer);pendingTransfer=null;$('#transferConfirmDialog').close();transferStatus('読み込みました。ミッション・完了状態・背景を確認してから、元のアイコンを整理してください')}catch{transferStatus('読み込めませんでした。元のアイコンと保存ファイルは残してください')}finally{button.disabled=false;$('#transferCancel').disabled=false}};
