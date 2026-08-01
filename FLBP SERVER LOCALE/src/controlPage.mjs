export const controlPage = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>FLBP Server Locale</title>
  <style>
    :root{font-family:Inter,Segoe UI,sans-serif;color:#0f172a;background:#eef2ff}body{margin:0;padding:32px}.box{max-width:880px;margin:auto;background:white;border-radius:22px;padding:28px;box-shadow:0 20px 60px #1e293b22}h1{margin:0 0 6px}p{color:#475569}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:22px 0}.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px}.label{font-size:12px;text-transform:uppercase;color:#64748b;font-weight:800}.value{font-size:18px;font-weight:800;overflow-wrap:anywhere}.row{display:flex;gap:10px;flex-wrap:wrap}button,a.button{border:0;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer;text-decoration:none;background:#4f46e5;color:white}button.warn{background:#dc2626}button.alt,a.alt{background:#0f172a}.msg{margin-top:18px;padding:12px;border-radius:12px;background:#e0e7ff;white-space:pre-wrap}.bad{background:#fee2e2;color:#991b1b}.ok{color:#166534}.standby{color:#92400e}@media(max-width:600px){body{padding:12px}.box{padding:18px}}
  </style>
</head>
<body><main class="box">
  <h1>FLBP Server Locale</h1>
  <p>Nodo primario del torneo con SQLite, journal durevole e backup Supabase.</p>
  <div id="status" class="grid"></div>
  <div class="row">
    <button id="activate">Attiva modalità locale</button>
    <button id="resume" class="alt">Conferma ripresa backup</button>
    <button id="backup" class="alt">Backup immediato</button>
    <button id="deactivate" class="warn">Chiudi modalità locale</button>
    <a class="button alt" href="/app/">Apri FLBP Manager</a>
  </div>
  <div id="msg" class="msg">Caricamento stato…</div>
</main>
<script src="/control.js" defer></script>
</body></html>`;

export const controlPageScript = `
const msg=document.querySelector('#msg');
const setToken=(v)=>sessionStorage.setItem('flbp_local_control_token',v);
const token=async()=>{const cached=sessionStorage.getItem('flbp_local_control_token');if(cached)return cached;try{const res=await fetch('/control/local-session',{method:'POST'});if(res.ok){const body=await res.json();if(body.token){setToken(body.token);return body.token}}}catch{}return prompt('Token Admin del server locale:')||''};
const api=async(path,options={})=>{const t=await token();setToken(t);const res=await fetch(path,{...options,headers:{'content-type':'application/json','x-flbp-local-token':t,...options.headers}});const body=await res.json().catch(()=>({error:'Risposta non valida'}));if(!res.ok)throw new Error(body.error||('HTTP '+res.status));return body};
const refresh=async()=>{try{const s=await fetch('/health').then(r=>r.json());const transitioning=s.transition&&s.transition!=='idle';const restored=s.transition==='restore-pending';const stateLabel=restored?'RIPRISTINO BLOCCATO':(transitioning?'DRAINING / VERIFICA RICHIESTA':(s.active?'PRIMARIO LOCALE':'STANDBY'));document.querySelector('#resume').style.display=restored?'inline-block':'none';document.querySelector('#status').innerHTML=[['Stato',stateLabel],['Transizione',s.transition||'idle'],['Versione',s.version??'—'],['Operazioni in coda',s.pendingOperations],['Ultimo backup cloud',s.lastBackupAt||'—'],['Replica secondaria',s.lastSecondaryBackupAt?(s.lastSecondaryBackupAt+' · v'+s.lastSecondaryBackupVersion):'non configurata/eseguita'],['Aggiornato',s.updatedAt||'—'],['Epoch',s.primaryEpoch||'—']].map(([a,b])=>'<div class="card"><div class="label">'+a+'</div><div class="value '+(a==='Stato'?(transitioning?'standby':(s.active?'ok':'standby')):'')+'">'+b+'</div></div>').join('');msg.className=transitioning?'msg bad':'msg';msg.textContent=(s.configErrors||[]).length?'Configurazione da completare:\\n'+s.configErrors.join('\\n'):(restored?'Backup ripristinato. Le scritture restano bloccate: conferma la ripresa per far verificare nodo ed epoch a Supabase.':(transitioning?'Nessuna nuova scrittura è accettata finché la transizione non viene risolta.':'Server pronto.'))}catch(e){msg.className='msg bad';msg.textContent=e.message}};
const action=(path)=>async()=>{try{msg.className='msg';msg.textContent='Operazione in corso…';const out=await api(path,{method:'POST',body:'{}'});if(path==='/control/deactivate')localStorage.setItem('flbp_normalized_sync_required_v1','1');localStorage.setItem('flbp_data_plane_change_v1',String(Date.now()));msg.textContent=JSON.stringify(out,null,2);await refresh()}catch(e){msg.className='msg bad';msg.textContent=e.message}};
document.querySelector('#activate').onclick=action('/control/activate');document.querySelector('#resume').onclick=action('/control/resume-restored');document.querySelector('#backup').onclick=action('/control/backup');document.querySelector('#deactivate').onclick=action('/control/deactivate');refresh();setInterval(refresh,5000);
`;
