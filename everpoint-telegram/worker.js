const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8', ...extra}});
const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET,POST,OPTIONS'};
const key = (p) => `ep:${p}`;

async function sha256(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function makeSession(env, employeeId){const raw=crypto.randomUUID()+crypto.randomUUID(); const token=await sha256(raw+env.SESSION_SECRET); await env.DATA.put(key(`session:${token}`), employeeId,{expirationTtl:60*60*24*7}); return token;}
async function employeeFromRequest(req,env){const h=req.headers.get('authorization')||''; const token=h.startsWith('Bearer ')?h.slice(7):''; if(!token)return null; const id=await env.DATA.get(key(`session:${token}`)); return id;}
async function tg(env, method, body){const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); return r.json();}
async function adminOnly(req,env){return (req.headers.get('x-telegram-admin')||'')===env.TELEGRAM_ADMIN_CHAT_ID;}
async function getEmployees(env){return JSON.parse(await env.DATA.get(key('employees'))||'[]');}
async function saveEmployees(env,a){await env.DATA.put(key('employees'),JSON.stringify(a));}
async function getApplications(env){return JSON.parse(await env.DATA.get(key('applications'))||'[]');}
async function saveApplications(env,a){await env.DATA.put(key('applications'),JSON.stringify(a));}

async function telegramUpdate(update,env){
  const msg=update.message; const cb=update.callback_query; const chatId=String(msg?.chat?.id ?? cb?.message?.chat?.id ?? '');
  if(chatId!==env.TELEGRAM_ADMIN_CHAT_ID){ if(msg) await tg(env,'sendMessage',{chat_id:chatId,text:'Access denied.'}); return new Response('ok'); }
  if(cb){ await tg(env,'answerCallbackQuery',{callback_query_id:cb.id}); await botMenu(env,chatId); return new Response('ok'); }
  const text=(msg?.text||'').trim();
  if(text==='/start'||text==='/menu'){await botMenu(env,chatId);return new Response('ok');}
  if(text==='/help'){await tg(env,'sendMessage',{chat_id:chatId,text:'/menu\n/addemployee NAME|EMAIL|PASSWORD\n/list\n/progress EMPLOYEE_ID|STEP|on/off\n/reimburse EMPLOYEE_ID|AMOUNT|STATUS\n/notify EMPLOYEE_ID|TITLE|MESSAGE\n/announce TITLE|MESSAGE'});return new Response('ok');}
  if(text.startsWith('/addemployee ')){const [name,email,password]=text.slice(13).split('|').map(x=>x.trim()); if(!name||!email||!password){await tg(env,'sendMessage',{chat_id:chatId,text:'Usage: /addemployee NAME|EMAIL|PASSWORD'});return new Response('ok');} const emps=await getEmployees(env); if(emps.some(e=>e.email.toLowerCase()===email.toLowerCase())){await tg(env,'sendMessage',{chat_id:chatId,text:'Employee email already exists.'});return new Response('ok');} const id='EMP-'+Math.random().toString(36).slice(2,8).toUpperCase(); emps.push({id,name,email,passwordHash:await sha256(password),active:true,progress:{application_reviewed:false,shortlisted:false,interview:false,onboarding:false,device_activation:false,work_starts:false},reimbursement:{amount:0,status:'none',description:''},notifications:[],documents:{}}); await saveEmployees(env,emps); await tg(env,'sendMessage',{chat_id:chatId,text:`Employee created.\nID: ${id}\nName: ${name}\nEmail: ${email}`});return new Response('ok');}
  if(text==='/list'){const emps=await getEmployees(env); await tg(env,'sendMessage',{chat_id:chatId,text:emps.length?emps.map(e=>`${e.id} — ${e.name} — ${e.active?'Active':'Inactive'}`).join('\n'):'No employees yet.'});return new Response('ok');}
  if(text.startsWith('/progress ')){const [id,step,value]=text.slice(11).split('|').map(x=>x.trim()); const emps=await getEmployees(env); const e=emps.find(x=>x.id===id); if(!e){await tg(env,'sendMessage',{chat_id:chatId,text:'Employee not found.'});return new Response('ok');} e.progress[step]=['on','true','yes','1'].includes(value.toLowerCase()); await saveEmployees(env,emps); await tg(env,'sendMessage',{chat_id:chatId,text:`Updated ${id}: ${step} = ${e.progress[step]}`});return new Response('ok');}
  if(text.startsWith('/reimburse ')){const [id,amount,status,...desc]=text.slice(11).split('|').map(x=>x.trim()); const emps=await getEmployees(env); const e=emps.find(x=>x.id===id); if(!e){await tg(env,'sendMessage',{chat_id:chatId,text:'Employee not found.'});return new Response('ok');} e.reimbursement={amount:Number(amount)||0,status:status||'pending',description:desc.join('|')}; await saveEmployees(env,emps); await tg(env,'sendMessage',{chat_id:chatId,text:`Reimbursement updated for ${id}.`});return new Response('ok');}
  if(text.startsWith('/notify ')){const [id,title,message]=text.slice(9).split('|').map(x=>x.trim()); const emps=await getEmployees(env); const e=emps.find(x=>x.id===id); if(!e){await tg(env,'sendMessage',{chat_id:chatId,text:'Employee not found.'});return new Response('ok');} e.notifications=e.notifications||[]; e.notifications.unshift({id:crypto.randomUUID(),title,body:message,createdAt:new Date().toISOString(),read:false}); await saveEmployees(env,emps); await tg(env,'sendMessage',{chat_id:chatId,text:'Notification sent to employee dashboard.'});return new Response('ok');}
  if(text.startsWith('/announce ')){const [title,message]=text.slice(10).split('|').map(x=>x.trim()); const emps=await getEmployees(env); for(const e of emps){e.notifications=e.notifications||[];e.notifications.unshift({id:crypto.randomUUID(),title,body:message,createdAt:new Date().toISOString(),read:false});} await saveEmployees(env,emps); await tg(env,'sendMessage',{chat_id:chatId,text:'Announcement sent to all employees.'});return new Response('ok');}
  await botMenu(env,chatId); return new Response('ok');
}
async function botMenu(env,chatId){await tg(env,'sendMessage',{chat_id:chatId,text:'EverPoint Holding Admin\n\nUse /help for commands.\n\nQuick actions:',reply_markup:{inline_keyboard:[[{text:'👥 Employees',callback_data:'employees'}],[{text:'📋 Applications',callback_data:'applications'}],[{text:'📊 Help / Commands',callback_data:'help'}]]}});}

export default {async fetch(req,env){
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  const url=new URL(req.url); const p=url.pathname;
  if(p==='/telegram/webhook' && req.method==='POST') return telegramUpdate(await req.json(),env);
  if(!p.startsWith('/api/')) return env.ASSETS.fetch(req);
  try{
    if(p==='/api/login'&&req.method==='POST'){const {email,password}=await req.json(); const emps=await getEmployees(env); const e=emps.find(x=>x.email.toLowerCase()===String(email).toLowerCase()); if(!e||!e.active||e.passwordHash!==await sha256(password))return json({error:'Invalid login'},401,cors); const token=await makeSession(env,e.id); return json({token,employee:{id:e.id,name:e.name,email:e.email}},200,cors);}
    if(p==='/api/me'&&req.method==='GET'){const id=await employeeFromRequest(req,env); if(!id)return json({error:'Unauthorized'},401,cors); const e=(await getEmployees(env)).find(x=>x.id===id); if(!e)return json({error:'Not found'},404,cors); return json({employee:{...e,passwordHash:undefined}},200,cors);}
    if(p==='/api/application'&&req.method==='POST'){const a=await req.json(); const apps=await getApplications(env); const item={id:crypto.randomUUID(),...a,submittedAt:new Date().toISOString()}; apps.unshift(item); await saveApplications(env,apps); await tg(env,'sendMessage',{chat_id:env.TELEGRAM_ADMIN_CHAT_ID,text:`📋 New EverPoint application\n\nName: ${a.firstName||''} ${a.lastName||''}\nEmail: ${a.email||''}\nRole: ${a.role||''}\nTeams: ${a.teams||''}`}); return json({ok:true,id:item.id},200,cors);}
    if(p==='/api/admin/applications'&&req.method==='GET'){if(!(await adminOnly(req,env)))return json({error:'Forbidden'},403,cors);return json({applications:await getApplications(env)},200,cors);}
    return json({error:'Not found'},404,cors);
  }catch(err){return json({error:'Server error'},500,cors);}
}};
