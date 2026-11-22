function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store",...headers}})}
const TEACHER_CODE_SHA256="c38217d983803c199aa25bc3779e2c45c45fc90df79c8fbcf670503154d1c7f9";
async function hash(value){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("")}
async function matchesTeacherCode(value){return (await hash(value))===TEACHER_CODE_SHA256}
function token(){const b=crypto.getRandomValues(new Uint8Array(32));let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function normalizeIdentity(value){return String(value||"").normalize("NFKC").replace(/\s+/g," ").trim()}
function sessionCookie(raw){return {"Set-Cookie":"participant_session="+raw+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000"}}
async function issueSession(env,id){
 const raw=token(),expires=Date.now()+30*24*60*60*1000;
 await env.DB.prepare("INSERT INTO participant_sessions (token_hash,participant_id,expires_at) VALUES (?1,?2,?3)").bind(await hash(raw),id,expires).run();
 await env.DB.prepare("DELETE FROM participant_sessions WHERE expires_at<=?1").bind(Date.now()).run();
 return raw;
}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير مربوطة."},503);
 let body;try{body=await request.json()}catch{return json({success:false,message:"الطلب غير صالح."},400)}
 const name=String(body.name||"").trim().slice(0,80),kunya=String(body.kunya||"").trim().slice(0,60),role=String(body.role||"student");
 const phone=String(body.phone||"").replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[\s-]/g,"");
 if(!["student","teacher"].includes(role))return json({success:false,message:"نوع الدخول غير صالح."},400);
 if(!name||!kunya||!/^05\d{8}$/.test(phone))return json({success:false,message:"تحقق من الاسم والكنية ورقم الجوال."},400);
 if(role==="teacher"&&!(await matchesTeacherCode(String(body.teacherCode||"").trim())))return json({success:false,message:"رمز المعلمين غير صحيح."},401);
 try{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunya TEXT NOT NULL, phone TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  for(const sql of ["ALTER TABLE participants ADD COLUMN role TEXT NOT NULL DEFAULT 'student'","ALTER TABLE participants ADD COLUMN photo_data TEXT","ALTER TABLE participants ADD COLUMN wallet_balance INTEGER NOT NULL DEFAULT 1000"])try{await env.DB.prepare(sql).run()}catch(e){}
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participant_sessions (token_hash TEXT PRIMARY KEY, participant_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)").run();

  // Reuse the existing identity within the same role; student and teacher records stay separate.
  const existing=await env.DB.prepare("SELECT id,name,kunya,wallet_balance FROM participants WHERE role=?1 AND phone=?2 ORDER BY id ASC LIMIT 1").bind(role,phone).first();
  if(existing){
   if(normalizeIdentity(existing.name)!==normalizeIdentity(name)||normalizeIdentity(existing.kunya)!==normalizeIdentity(kunya)){
    return json({success:false,message:"هذا الرقم مرتبط بسجل سابق، لكن الاسم أو الكنية لا يطابقان بياناته. راجع المنظّم لتحديث البيانات."},409);
   }
   if(body.consent!==true)return json({success:false,message:"يلزم تأكيد الموافقة على استخدام البيانات."},400);
   const raw=await issueSession(env,existing.id);
   const balance=Number(existing.wallet_balance??(role==="teacher"?0:1000));
   return json({success:true,id:existing.id,walletBalance:balance,returning:true,message:"أهلًا بعودتك! دخلت إلى سجلك السابق دون إنشاء تسجيل جديد."},200,sessionCookie(raw));
  }

  if(body.consent!==true)return json({success:false,message:"يلزم الموافقة على استخدام البيانات."},400);
  // The conditional insert prevents a second record if two registration requests arrive together.
  const balance=role==="teacher"?0:1000;
  const inserted=await env.DB.prepare("INSERT INTO participants (name,kunya,phone,role,consent_at,wallet_balance) SELECT ?1,?2,?3,?4,?5,?6 WHERE NOT EXISTS (SELECT 1 FROM participants WHERE role=?4 AND phone=?3) AND (?4<>'teacher' OR (SELECT COUNT(*) FROM participants WHERE role='teacher')<5)").bind(name,kunya,phone,role,new Date().toISOString(),balance).run();
  let id=inserted.meta?.last_row_id;
  if(!id){
   const raced=await env.DB.prepare("SELECT id,name,kunya,wallet_balance FROM participants WHERE role=?1 AND phone=?2 ORDER BY id ASC LIMIT 1").bind(role,phone).first();
   if(raced){
    if(normalizeIdentity(raced.name)!==normalizeIdentity(name)||normalizeIdentity(raced.kunya)!==normalizeIdentity(kunya))return json({success:false,message:"هذا الرقم مرتبط بسجل سابق، لكن الاسم أو الكنية لا يطابقان بياناته. راجع المنظّم لتحديث البيانات."},409);
    const raw=await issueSession(env,raced.id);
    return json({success:true,id:raced.id,walletBalance:Number(raced.wallet_balance??balance),returning:true,message:"أهلًا بعودتك! دخلت إلى سجلك السابق دون إنشاء تسجيل جديد."},200,sessionCookie(raw));
   }
   if(role==="teacher"){
    const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM participants WHERE role='teacher'").first();
    if(Number(count?.total||0)>=5)return json({success:false,message:"اكتمل عدد حسابات المعلمين الخمسة."},409);
   }
   throw new Error("participant insert failed");
  }
  const raw=await issueSession(env,id);
  await env.DB.prepare("UPDATE participants SET wallet_balance=0 WHERE role='teacher'").run();
  return json({success:true,id,walletBalance:balance,returning:false,message:"تم حفظ تسجيلك بنجاح."},201,sessionCookie(raw));
 }catch(error){return json({success:false,message:"تعذر حفظ التسجيل في قاعدة البيانات."},500)}
}
export async function onRequestGet(){return json({success:false,message:"استخدم نموذج التسجيل."},405)}
