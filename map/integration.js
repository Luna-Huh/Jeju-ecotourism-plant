'use strict';
// Standalone handoff only: enable a compact view when embedded in the catalog.
if(new URLSearchParams(location.search).get('embed')==='1')document.documentElement.classList.add('atlas-embedded');

// Link back to the plant catalog, keeping the currently selected village.
document.addEventListener('DOMContentLoaded',()=>{const a=document.getElementById('catalog-back');if(!a)return;
 const upd=()=>{const v=new URLSearchParams(location.search).get('village');a.href=(v&&v!=='all')?`../?village=${encodeURIComponent(v)}`:'../';};
 upd();a.addEventListener('pointerdown',upd);a.addEventListener('focus',upd);a.addEventListener('click',upd);});

// Catalog village page: lock=1 shows only the requested village (no switching to other villages).
(()=>{const q=new URLSearchParams(location.search);const locked=q.get('village');
 if(q.get('lock')!=='1'||!['jeoji','pyeongdae','harye','hogeun'].includes(locked))return;
 document.documentElement.classList.add('atlas-locked');
 document.addEventListener('DOMContentLoaded',()=>{
  if(typeof window.selectVillage!=='function')return;
  const original=window.selectVillage;
  window.selectVillage=function(id,...rest){return id===locked?original.call(this,id,...rest):Promise.resolve();};
 });
})();

// Catalog site: the "all villages" view is not offered; open the first village instead.
(()=>{const q=new URLSearchParams(location.search);if(q.get('village')==='all'||!q.get('village')){q.set('village','jeoji');history.replaceState(null,'',`${location.pathname}?${q}${location.hash}`);}})();

// Village colours from the plant catalog: html[data-village] drives the theme in integration.css.
(()=>{const ids=['jeoji','pyeongdae','harye','hogeun'];const root=document.documentElement;
 const apply=()=>{const v=new URLSearchParams(location.search).get('village');if(ids.includes(v))root.dataset.village=v;};
 apply();
 document.addEventListener('DOMContentLoaded',()=>{if(typeof window.selectVillage!=='function')return;const inner=window.selectVillage;
  window.selectVillage=async function(...args){const r=await inner.apply(this,args);apply();return r;};});
})();

// Brand goes to the plant catalog home (instead of the map's own reset handler).
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a.brand');if(a){e.stopPropagation();}},true);
