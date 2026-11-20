function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
const ADMIN_CODE_SHA256="e84fb0a88a88f3af6e2fb3508bb1b0c658db5a281ccd9027024b23c870bd2a92";
async function isAdminCode(value){
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 return hex===ADMIN_CODE_SHA256;
}
export async function onRequestGet({request,env}){
 const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!(await isAdminCode(token)))return json({success:false,message:"رمز المشرف غير صحيح."},401);
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير مربوطة."},503);
 try{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS participants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kunya TEXT NOT NULL, phone TEXT NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  try{await env.DB.prepare("ALTER TABLE participants ADD COLUMN role TEXT NOT NULL DEFAULT 'student'").run()}catch(e){}
  const {results=[]}=await env.DB.prepare("SELECT id,name,kunya,phone,role,consent_at,created_at FROM participants ORDER BY id DESC LIMIT 500").all();
  return json({success:true,participants:results});
 }catch(e){return json({success:false,message:"تعذر قراءة التسجيلات."},500)}
}
