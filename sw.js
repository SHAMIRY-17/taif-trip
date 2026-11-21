'use strict';
const CACHE='taif-game-v3';
const GAME_FILES=Array.from({length:11},(_,i)=>'/game-parts/part-'+String(i).padStart(2,'0')+'.txt');
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('taif-game-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('message',event=>{
 if(event.data!=='CACHE_GAME_FILES')return;
 event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.all(GAME_FILES.map(async url=>{try{const req=new Request(url,{cache:'reload'});const res=await fetch(req);if(res.ok)await cache.put(url,res);}catch(_){}}));})());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||!GAME_FILES.includes(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(url.pathname);if(cached)return cached;const fresh=await fetch(event.request);if(fresh.ok)cache.put(url.pathname,fresh.clone());return fresh;})());
});