function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
const TEACHER_CODE_SHA256="c38217d983803c199aa25bc3779e2c45c45fc90df79c8fbcf670503154d1c7f9";
async function matchesTeacherCode(value){
 const bytes=new TextEncoder().encode(value);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 return hex===TEACHER_CODE_SHA256;
}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير مربوطة."},503);
 let body;try{body=await request.json()}catch{return json({success:false,message:"الطلب غير صالح."},400)}
 const name=String(body.name||"").trim().slice(0,80);
 const kunya=String(body.kunya||"").trim().slice(0,60);
 const role=String(body.role||"student");
 const phone=String(body.phone||"").replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[\s-]/g,"");
 const teacherCode=String(body.teacherCode||"").trim();
 if(body.consent!==true)return json({success:false,message:"يلزم الموافقة على استخدام البيانات."},400);
 if(!["student","teacher"].includes(role))return json({success:false,message:"نوع الدخول غير صالح."},400);
 if(!name||!kunya||!/^05\d{8}$/.test(phone))return json({success:false,message:"تحقق من الاسم والكنية ورقم الجوال."},400);
 if(role==="teacher"&&!(await matchesTeacherCode(teacherCode)))return json({success:false,message:"رمز المعلمين غير صحيح."},401);
 try{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunya TEXT NOT NULL, phone TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  try{await env.DB.prepare("ALTER TABLE participants ADD COLUMN role TEXT NOT NULL DEFAULT 'student'").run()}catch(e){}
  if(role==="teacher"){
   const existing=await env.DB.prepare("SELECT id FROM participants WHERE role='teacher' AND phone=?1 LIMIT 1").bind(phone).first();
   if(existing)return json({success:false,message:"هذا الرقم مسجل مسبقًا كحساب معلم. تواصل مع المنظّم إذا احتجت مساعدة."},409);
   const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM participants WHERE role='teacher'").first();
   if(Number(count?.total||0)>=5)return json({success:false,message:"اكتمل عدد حسابات المعلمين الخمسة."},409);
  }
  const result=await env.DB.prepare("INSERT INTO participants (name,kunya,phone,role,consent_at) VALUES (?1,?2,?3,?4,?5)").bind(name,kunya,phone,role,new Date().toISOString()).run();
  return json({success:true,id:result.meta?.last_row_id||null,message:"تم تسجيل المشاركة."},201);
 }catch(error){return json({success:false,message:"تعذر حفظ التسجيل في قاعدة البيانات."},500)}
}
export async function onRequestGet(){return json({success:false,message:"استخدم نموذج التسجيل."},405)}
