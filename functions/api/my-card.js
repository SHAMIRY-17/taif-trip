function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
async function hash(value){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("")}
function cookie(r,n){for(const part of (r.headers.get("Cookie")||"").split(";")){const [k,...v]=part.trim().split("=");if(k===n)return v.join("=")}return ""}
export async function onRequestGet({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير متاحة."},503);
 const raw=cookie(request,"participant_session");if(!raw)return json({success:false,message:"انتهت جلسة المشارك. سجّل الدخول من جديد."},401);
 try{
  const h=await hash(raw),session=await env.DB.prepare("SELECT participant_id FROM participant_sessions WHERE token_hash=?1 AND expires_at>?2").bind(h,Date.now()).first();
  if(!session)return json({success:false,message:"انتهت جلسة المشارك. سجّل الدخول من جديد."},401);
  const p=await env.DB.prepare("SELECT id,name,kunya,role,photo_data,wallet_balance FROM participants WHERE id=?1").bind(session.participant_id).first();
  if(!p)return json({success:false,message:"لم نعثر على بطاقة المشارك."},404);
  return json({success:true,participant:{id:p.id,name:p.name,kunya:p.kunya,role:p.role,photoData:p.photo_data||"",walletBalance:Number(p.wallet_balance??0)}});
 }catch(e){return json({success:false,message:"تعذر تحميل بطاقتك الآن."},500)}
}
