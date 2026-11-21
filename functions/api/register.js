function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store",...headers}})}
const TEACHER_CODE_SHA256="c38217d983803c199aa25bc3779e2c45c45fc90df79c8fbcf670503154d1c7f9";
async function hash(value){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("")}
async function matchesTeacherCode(value){return (await hash(value))===TEACHER_CODE_SHA256}
function token(){const b=crypto.getRandomValues(new Uint8Array(32));let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير مربوطة."},503);
 let body;try{body=await request.json()}catch{return json({success:false,message:"الطلب غير صالح."},400)}
 const name=String(body.name||"").trim().slice(0,80),kunya=String(body.kunya||"").trim().slice(0,60),role=String(body.role||"student");
 const phone=String(body.phone||"").replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[\s-]/g,"");
 if(body.consent!==true)return json({success:false,message:"يلزم الموافقة على استخدام البيانات."},400);
 if(!["student","teacher"].includes(role))return json({success:false,message:"نوع الدخول غير صالح."},400);
 if(!name||!kunya||!/^05\d{8}$/.test(phone))return json({success:false,message:"تحقق من الاسم والكنية ورقم الجوال."},400);
 if(role==="teacher"&&!(await matchesTeacherCode(String(body.teacherCode||"").trim())))return json({success:false,message:"رمز المعلمين غير صحيح."},401);
 try{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunya TEXT NOT NULL, phone TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  for(const sql of ["ALTER TABLE participants ADD COLUMN role TEXT NOT NULL DEFAULT 'student'","ALTER TABLE participants ADD COLUMN photo_data TEXT","ALTER TABLE participants ADD COLUMN wallet_balance INTEGER NOT NULL DEFAULT 1000"])try{await env.DB.prepare(sql).run()}catch(e){}
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participant_sessions (token_hash TEXT PRIMARY KEY, participant_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)").run();
  if(role==="teacher"){
   const existing=await env.DB.prepare("SELECT id FROM participants WHERE role='teacher' AND phone=?1 LIMIT 1").bind(phone).first();
   if(existing)return json({success:false,message:"هذا الرقم مسجل مسبقًا كحساب معلم. تواصل مع المنظّم إذا احتجت مساعدة."},409);
   const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM participants WHERE role='teacher'").first();
   if(Number(count?.total||0)>=5)return json({success:false,message:"اكتمل عدد حسابات المعلمين الخمسة."},409);
  }
  const balance=role==="teacher"?0:1000;
  const result=await env.DB.prepare("INSERT INTO participants (name,kunya,phone,role,consent_at,wallet_balance) VALUES (?1,?2,?3,?4,?5,?6)").bind(name,kunya,phone,role,new Date().toISOString(),balance).run();
  const id=result.meta?.last_row_id;if(!id)throw new Error("participant insert failed");
  const raw=token(),expires=Date.now()+30*24*60*60*1000;
  await env.DB.prepare("INSERT INTO participant_sessions (token_hash,participant_id,expires_at) VALUES (?1,?2,?3)").bind(await hash(raw),id,expires).run();
  await env.DB.prepare("DELETE FROM participant_sessions WHERE expires_at<=?1").bind(Date.now()).run();
  return json({success:true,id,walletBalance:balance,message:"تم التسجيل بنجاح."},201,{"Set-Cookie":"participant_session="+raw+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000"});
 }catch(error){return json({success:false,message:"تعذر حفظ التسجيل في قاعدة البيانات."},500)}
}
export async function onRequestGet(){return json({success:false,message:"استخدم نموذج التسجيل."},405)}
