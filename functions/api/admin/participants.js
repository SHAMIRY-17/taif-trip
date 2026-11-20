function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
export async function onRequestGet({request,env}){
 const token=request.headers.get("Authorization")||"";
 if(!env.ADMIN_TOKEN)return json({success:false,message:"لم يتم إعداد رمز المشرف في إعدادات Cloudflare."},503);
 if(token!=="Bearer "+env.ADMIN_TOKEN)return json({success:false,message:"غير مصرح. تحقق من رمز المشرف."},401);
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير مربوطة."},503);
 try{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunya TEXT NOT NULL, phone TEXT NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const {results=[]}=await env.DB.prepare("SELECT id,name,kunya,phone,consent_at,created_at FROM participants ORDER BY id DESC LIMIT 500").all();
  return json({success:true,participants:results});
 }catch(e){return json({success:false,message:"تعذر قراءة التسجيلات."},500)}
}
