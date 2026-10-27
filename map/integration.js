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

// Public "지도 안내" text (replaces the research/verification notes in the data dialog).
document.addEventListener('DOMContentLoaded',()=>{const box=document.getElementById('info-content');if(!box)return;
 const html=`<div data-catalog-info><section><h3>이 지도에 담은 자료</h3><p>저지리·평대리·하례리·호근동의 농지, 투수성 지형(숨골·곶자왈 등), 용천수 자료를 마을별 지도와 통계로 정리했습니다. 지도 레이어를 켜고 끄며 마을의 땅과 물을 살펴보세요.</p></section>
<section><h3>마을 안내도와 장소</h3><p>마을 그림지도는 제주생태관광협회 자료입니다. 장소 설명은 공식 관광·마을 안내 자료를 바탕으로 정리했으며, 지도 위 위치는 대표 지점이라 실제 입구와 다를 수 있습니다.</p></section>
<section><h3>숫자를 읽는 법</h3><p>농지 면적은 비경지를 제외한 합계이고, 농지 비율은 마을 농지 구획의 면적을 기준으로 계산했습니다. 저지리는 용천수 자료가 없어 용천수 수를 표시하지 않습니다.</p></section>
<section><h3>지도 출처</h3><p>배경지도 Esri World Topographic Map·World Imagery · 마을 경계 행정안전부 · © OpenStreetMap contributors · GeoNames</p></section></div>`;
 const apply=()=>{if(!box.querySelector('[data-catalog-info]'))box.innerHTML=html;};
 apply();new MutationObserver(apply).observe(box,{childList:true});
});

// On phones, start with the map legend folded (visitors can open it again).
try{if(matchMedia('(max-width:800px)').matches&&localStorage.getItem('jeju-atlas-legend-hidden')===null)localStorage.setItem('jeju-atlas-legend-hidden','true');}catch{}
