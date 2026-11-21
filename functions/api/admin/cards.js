function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
async function hash(value){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("")}
function cookie(r,n){for(const part of (r.headers.get("Cookie")||"").split(";")){const [k,...v]=part.trim().split("=");if(k===n)return v.join("=")}return ""}
async function authorized(request,env){const raw=cookie(request,"admin_session");if(!raw||!env.DB)return false;const h=await hash(raw);return !!(await env.DB.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash=?1 AND expires_at>?2").bind(h,Date.now()).first())}
async function ensure(env){await env.DB.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunya TEXT NOT NULL, phone TEXT NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();try{await env.DB.prepare("ALTER TABLE participants ADD COLUMN photo_data TEXT").run()}catch(e){}}
export async function onRequestGet({request,env}){
 if(!await authorized(request,env))return json({success:false,message:"يلزم تسجيل دخول المشرف."},401);
 try{await ensure(env);const id=Number(new URL(request.url).searchParams.get("id")||0);
  if(id){const p=await env.DB.prepare("SELECT id,name,kunya,role,photo_data FROM participants WHERE id=?1").bind(id).first();if(!p)return json({success:false,message:"المشارك غير موجود."},404);return json({success:true,participant:{id:p.id,name:p.name,kunya:p.kunya,role:p.role||"student",photoData:p.photo_data||""}})}
  const {results=[]}=await env.DB.prepare("SELECT id,name,kunya,role,(photo_data IS NOT NULL AND photo_data<>'') AS has_photo FROM participants ORDER BY id DESC LIMIT 500").all();
  return json({success:true,participants:results});
 }catch(e){return json({success:false,message:"تعذر تحميل بطاقات المشاركين."},500)}
}
export async function onRequestPost({request,env}){
 if(!await authorized(request,env))return json({success:false,message:"يلزم تسجيل دخول المشرف."},401);
 let body;try{body=await request.json()}catch{return json({success:false,message:"الطلب غير صالح."},400)}
 const id=Number(body.id),photo=String(body.photoData||"");
 if(!Number.isInteger(id)||id<1)return json({success:false,message:"رقم المشارك غير صحيح."},400);
 if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)||photo.length>850000)return json({success:false,message:"الصورة غير مناسبة. اختر صورة أصغر."},400);
 try{await ensure(env);const r=await env.DB.prepare("UPDATE participants SET photo_data=?1 WHERE id=?2").bind(photo,id).run();if(!r.meta?.changes)return json({success:false,message:"المشارك غير موجود."},404);return json({success:true,message:"تم حفظ صورة بطاقة المشارك."})}
 catch(e){return json({success:false,message:"تعذر حفظ الصورة."},500)}
}
