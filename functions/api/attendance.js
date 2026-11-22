function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
async function hash(value){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("")}
function cookie(request,name){for(const part of (request.headers.get("Cookie")||"").split(";")){const [key,...value]=part.trim().split("=");if(key===name)return value.join("=")}return ""}
async function participantFromSession(request,env){
 const raw=cookie(request,"participant_session");if(!raw)return null;
 const tokenHash=await hash(raw);
 const session=await env.DB.prepare("SELECT participant_id FROM participant_sessions WHERE token_hash=?1 AND expires_at>?2").bind(tokenHash,Date.now()).first();
 if(!session)return null;
 return env.DB.prepare("SELECT id,role FROM participants WHERE id=?1").bind(session.participant_id).first();
}
export async function onRequestGet({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير متاحة."},503);
 try{
  const participant=await participantFromSession(request,env);
  if(!participant)return json({success:false,message:"انتهت جلستك. سجّل الدخول من جديد."},401);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS trip_attendance (participant_id INTEGER PRIMARY KEY, role TEXT NOT NULL, attendance TEXT NOT NULL CHECK(attendance IN ('yes','no')), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const row=await env.DB.prepare("SELECT attendance FROM trip_attendance WHERE participant_id=?1").bind(participant.id).first();
  return json({success:true,attendance:row?.attendance||null});
 }catch(error){return json({success:false,message:"تعذر تحميل حالة الحضور."},500)}
}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير متاحة."},503);
 let body;try{body=await request.json()}catch{return json({success:false,message:"بيانات الطلب غير صالحة."},400)}
 const attendance=String(body.attendance||"");
 if(!["yes","no"].includes(attendance))return json({success:false,message:"اختر نعم أو لا لتأكيد الحضور."},400);
 try{
  const participant=await participantFromSession(request,env);
  if(!participant)return json({success:false,message:"انتهت جلستك. سجّل الدخول من جديد."},401);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS trip_attendance (participant_id INTEGER PRIMARY KEY, role TEXT NOT NULL, attendance TEXT NOT NULL CHECK(attendance IN ('yes','no')), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("INSERT INTO trip_attendance (participant_id,role,attendance,updated_at) VALUES (?1,?2,?3,CURRENT_TIMESTAMP) ON CONFLICT(participant_id) DO UPDATE SET role=excluded.role,attendance=excluded.attendance,updated_at=CURRENT_TIMESTAMP").bind(participant.id,participant.role,attendance).run();
  return json({success:true,attendance});
 }catch(error){return json({success:false,message:"تعذر حفظ إجابتك الآن. حاول مرة أخرى."},500)}
}
