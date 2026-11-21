function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=UTF-8","Cache-Control":"no-store"}})}
async function hash(value){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("")}
function cookie(r,n){for(const part of (r.headers.get("Cookie")||"").split(";")){const [k,...v]=part.trim().split("=");if(k===n)return v.join("=")}return ""}
function token(){const b=crypto.getRandomValues(new Uint8Array(18));let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
const flavors={popcorn:["جبن","ملح","كراميل"],slush:["كنزا كولا","كنزا ليمون","كنزا حمضيات","كنزا دايت"]};
export async function onRequestPost({request,env}){
 if(!env.DB)return json({success:false,message:"قاعدة البيانات غير متاحة."},503);
 const raw=cookie(request,"participant_session");if(!raw)return json({success:false,message:"انتهت جلسة المشارك. أعد التسجيل."},401);
 let body;try{body=await request.json()}catch{return json({success:false,message:"الطلب غير صالح."},400)}
 try{
  const session=await env.DB.prepare("SELECT participant_id FROM participant_sessions WHERE token_hash=?1 AND expires_at>?2").bind(await hash(raw),Date.now()).first();
  if(!session)return json({success:false,message:"انتهت جلسة المشارك. أعد التسجيل."},401);
  const p=await env.DB.prepare("SELECT id,role,wallet_balance FROM participants WHERE id=?1").bind(session.participant_id).first();
  if(!p)return json({success:false,message:"المشارك غير موجود."},404);
  const seat=String(body.seat||"").toUpperCase(),role=p.role;
  const m=seat.match(/^([ABCD])(\d{1,2})$/),limits={A:5,B:7,C:9,D:11};
  if(!m||Number(m[2])<1||Number(m[2])>limits[m[1]]||(role==="teacher"?m[1]!=="A":m[1]==="A"))return json({success:false,message:"المقعد غير متاح لهذه الفئة."},400);
  const seatPrice=role==="teacher"?0:({B:600,C:500,D:400}[m[1]]);
  const submitted=Array.isArray(body.items)?body.items.slice(0,3):[],lines=[];
  for(const item of submitted){
   const kind=String(item?.kind||""),size=String(item?.size||"medium"),flavor=String(item?.flavor||"");
   if(!["popcorn","doritos","slush"].includes(kind)||!["medium","large"].includes(size))return json({success:false,message:"أحد الطلبات غير صالح."},400);
   if(kind==="popcorn"&&!flavors.popcorn.includes(flavor))return json({success:false,message:"نكهة الفشار غير صالحة."},400);
   if(kind==="slush"&&!flavors.slush.includes(flavor))return json({success:false,message:"نكهة السلاش غير صالحة."},400);
   const unit=kind==="popcorn"?(size==="large"?24:18):size==="large"?16:12;
   const name=(kind==="popcorn"?"فشار "+flavor:kind==="doritos"?"دوريتوس":"سلاش "+flavor)+" · "+(size==="large"?"كبير":"وسط");
   lines.push({kind,name,qty:1,total:role==="teacher"?0:unit});
  }
  const total=seatPrice+lines.reduce((n,x)=>n+x.total,0),checkoutId=token(),now=new Date().toISOString(),itemsJson=JSON.stringify(lines);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS cinema_orders (checkout_id TEXT PRIMARY KEY, participant_id INTEGER NOT NULL UNIQUE, seat TEXT NOT NULL UNIQUE, items_json TEXT NOT NULL, total INTEGER NOT NULL, wallet_after INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)").run();
  const insert=env.DB.prepare("INSERT INTO cinema_orders (checkout_id,participant_id,seat,items_json,total,wallet_after,created_at) SELECT ?1,id,?3,?4,?5,0,?6 FROM participants WHERE id=?2 AND (role='teacher' OR wallet_balance>=?5)").bind(checkoutId,p.id,seat,itemsJson,total,now);
  const update=env.DB.prepare("UPDATE participants SET wallet_balance=wallet_balance-?1 WHERE id=?2 AND role='student' AND EXISTS (SELECT 1 FROM cinema_orders WHERE checkout_id=?3)").bind(total,p.id,checkoutId);
  const batch=await env.DB.batch([insert,update]);
  if(!batch[0]?.meta?.changes)return json({success:false,message:"لم تتم العملية: قد يكون رصيدك غير كافٍ أو أن المقعد محجوز مسبقًا."},409);
  const latest=await env.DB.prepare("SELECT wallet_balance FROM participants WHERE id=?1").bind(p.id).first(),walletBalance=Number(latest?.wallet_balance??0);
  await env.DB.prepare("UPDATE cinema_orders SET wallet_after=?1 WHERE checkout_id=?2").bind(walletBalance,checkoutId).run();
  return json({success:true,orderId:checkoutId,seat,seatPrice,total,walletBalance,teacher:role==="teacher",lines,message:role==="teacher"?"تم تأكيد إعفاء المعلم الكامل.":"تم الخصم من محفظة الرحلة وإصدار التذكرة."},201);
 }catch(e){return json({success:false,message:"تعذر إتمام الشراء. إذا تكرر الأمر، تواصل مع المشرف."},500)}
}
