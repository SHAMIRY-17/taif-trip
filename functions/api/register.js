function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير مربوطة."},503);
 let body;try{body=await request.json()}catch{return json({success:false,message:"الطلب غير صالح."},400)}
 const name=String(body.name||"").trim().slice(0,80);
 const kunya=String(body.kunya||"").trim().slice(0,60);
 const phone=String(body.phone||"").replace(/[\s-]/g,"");
 if(body.consent!==true)return json({success:false,message:"يلزم الموافقة على استخدام البيانات."},400);
 if(!name||!kunya||!/^05\d{8}$/.test(phone))return json({success:false,message:"تحقق من الاسم والكنية ورقم الجوال."},400);
 try{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunya TEXT NOT NULL, phone TEXT NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const result=await env.DB.prepare("INSERT INTO participants (name,kunya,phone,consent_at) VALUES (?1,?2,?3,?4)").bind(name,kunya,phone,new Date().toISOString()).run();
  return json({success:true,id:result.meta?.last_row_id||null,message:"تم تسجيل المشاركة."},201);
 }catch(error){return json({success:false,message:"تعذر حفظ التسجيل في قاعدة البيانات."},500)}
}
export async function onRequestGet(){return json({success:false,message:"استخدم نموذج التسجيل."},405)}
