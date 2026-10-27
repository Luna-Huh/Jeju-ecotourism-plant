'use strict';
// Standalone handoff only: enable a compact view when embedded in the catalog.
if(new URLSearchParams(location.search).get('embed')==='1')document.documentElement.classList.add('atlas-embedded');

// Link back to the plant catalog, keeping the currently selected village.
document.addEventListener('DOMContentLoaded',()=>{const a=document.getElementById('catalog-back');if(!a)return;
 const upd=()=>{const v=new URLSearchParams(location.search).get('village');a.href=(v&&v!=='all')?`../?village=${encodeURIComponent(v)}`:'../';};
 upd();a.addEventListener('pointerdown',upd);a.addEventListener('focus',upd);a.addEventListener('click',upd);});
