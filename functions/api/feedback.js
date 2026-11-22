function json(data,status=200){
 return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير متاحة."},503);
 let body;
 try{body=await request.json()}catch{return json({success:false,message:"بيانات الطلب غير صالحة."},400)}
 const participantId=Number(body.participantId);
 const role=String(body.role||"");
 const answers=Array.isArray(body.answers)?body.answers.slice(0,10):[];
 if(!Number.isInteger(participantId)||participantId<1||!["student","teacher"].includes(role)||!answers.length){
  return json({success:false,message:"بيانات الاستبيان غير مكتملة."},400);
 }
 const clean=answers.map(item=>({
  question:String(item?.question||"").trim().slice(0,220),
  answer:String(item?.answer||"").trim().slice(0,160)
 })).filter(item=>item.question&&item.answer);
 if(!clean.length)return json({success:false,message:"اختر إجابة واحدة على الأقل."},400);
 try{
  const participant=await env.DB.prepare("SELECT id, role FROM participants WHERE id=?1").bind(participantId).first();
  if(!participant||participant.role!==role)return json({success:false,message:"تعذر التحقق من تسجيل المشارك."},403);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS trip_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, participant_id INTEGER NOT NULL, role TEXT NOT NULL, answers_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("INSERT INTO trip_feedback (participant_id,role,answers_json) VALUES (?1,?2,?3)")
   .bind(participantId,role,JSON.stringify(clean)).run();
  return json({success:true},201);
 }catch(error){
  return json({success:false,message:"تعذر حفظ رأيك حاليًا."},500);
 }
}
