function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
async function hash(value){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).map(x=>x.toString(16).padStart(2,"0")).join("")}
function cookie(request,name){for(const part of (request.headers.get("Cookie")||"").split(";")){const [key,...value]=part.trim().split("=");if(key===name)return value.join("=")}return ""}
export async function onRequestGet({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير متاحة."},503);
 try{
  const raw=cookie(request,"participant_session");if(!raw)return json({success:false,message:"سجّل الدخول بحساب المعلم أولًا."},401);
  const tokenHash=await hash(raw),session=await env.DB.prepare("SELECT participant_id FROM participant_sessions WHERE token_hash=?1 AND expires_at>?2").bind(tokenHash,Date.now()).first();
  if(!session)return json({success:false,message:"انتهت الجلسة. سجّل الدخول مجددًا."},401);
  const teacher=await env.DB.prepare("SELECT id,role FROM participants WHERE id=?1").bind(session.participant_id).first();
  if(!teacher||teacher.role!=="teacher")return json({success:false,message:"هذه الصفحة متاحة لحسابات المعلمين فقط."},403);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS trip_attendance (participant_id INTEGER PRIMARY KEY, role TEXT NOT NULL, attendance TEXT NOT NULL CHECK(attendance IN ('yes','no')), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const rows=await env.DB.prepare("SELECT p.name,p.kunya,p.role,a.attendance,a.updated_at FROM participants p LEFT JOIN trip_attendance a ON a.participant_id=p.id ORDER BY p.role,p.kunya,p.name").all();
  const attendance=rows.results||[];
  return json({success:true,attendance,stats:{yes:attendance.filter(x=>x.attendance==="yes").length,no:attendance.filter(x=>x.attendance==="no").length,pending:attendance.filter(x=>!x.attendance).length}});
 }catch(e){return json({success:false,message:"تعذر تحميل قائمة الحضور."},500)}
}
