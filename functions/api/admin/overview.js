function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
async function hash(value){const x=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(x),b=>b.toString(16).padStart(2,"0")).join("")}
function cookie(r,n){for(const part of (r.headers.get("Cookie")||"").split(";")){const [k,...v]=part.trim().split("=");if(k===n)return v.join("=")}return ""}
export async function onRequestGet({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير مربوطة."},503);
 const t=cookie(request,"admin_session");if(!t)return json({success:false,message:"يلزم تسجيل دخول المشرف."},401);
 try{
  const h=await hash(t),session=await env.DB.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash=?1 AND expires_at>?2").bind(h,Date.now()).first();
  if(!session)return json({success:false,message:"انتهت جلسة المشرف."},401);
  for(const sql of ["ALTER TABLE participants ADD COLUMN photo_data TEXT","ALTER TABLE participants ADD COLUMN wallet_balance INTEGER NOT NULL DEFAULT 1000"])try{await env.DB.prepare(sql).run()}catch(e){}
  await env.DB.prepare("UPDATE participants SET wallet_balance=0 WHERE role='teacher'").run();
  const participants=await env.DB.prepare("SELECT id,name,kunya,phone,role,created_at,(photo_data IS NOT NULL AND photo_data<>'') AS has_photo,wallet_balance FROM participants ORDER BY id DESC LIMIT 500").all();
  let feedback=[],orders=[];
  try{const f=await env.DB.prepare("SELECT f.id,f.participant_id,f.role,f.answers_json,f.created_at,p.name,p.kunya FROM trip_feedback f LEFT JOIN participants p ON p.id=f.participant_id ORDER BY f.id DESC LIMIT 500").all();feedback=f.results||[]}catch(e){}
  try{const o=await env.DB.prepare("SELECT o.seat,o.total,o.items_json,o.wallet_after,o.created_at,p.name,p.kunya,p.role FROM cinema_orders o LEFT JOIN participants p ON p.id=o.participant_id ORDER BY o.created_at DESC LIMIT 500").all();orders=o.results||[]}catch(e){}
  const all=participants.results||[];
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS trip_attendance (participant_id INTEGER PRIMARY KEY, role TEXT NOT NULL, attendance TEXT NOT NULL CHECK(attendance IN ('yes','no')), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  let attendance=[];
  try{const a=await env.DB.prepare("SELECT p.id,p.name,p.kunya,p.role,a.attendance,a.updated_at FROM participants p LEFT JOIN trip_attendance a ON a.participant_id=p.id ORDER BY p.role,p.kunya,p.name").all();attendance=a.results||[]}catch(e){}
  const attendanceStats={yes:attendance.filter(x=>x.attendance==='yes').length,no:attendance.filter(x=>x.attendance==='no').length,pending:attendance.filter(x=>!x.attendance).length};
  const uniqueRows=await env.DB.prepare("SELECT role,COUNT(DISTINCT phone) AS total FROM participants GROUP BY role").all();
  const uniqueCounts=Object.fromEntries((uniqueRows.results||[]).map(row=>[row.role,Number(row.total||0)]));
  const students=uniqueCounts.student||0,teachers=uniqueCounts.teacher||0;
  return json({success:true,participants:all,feedback,orders,attendance,attendanceStats,stats:{total:students+teachers,students,teachers,feedback:feedback.length,orders:orders.length}});
 }catch(e){return json({success:false,message:"تعذر تحميل بيانات لوحة المشرف."},500)}
}
