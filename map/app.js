'use strict';
const $=(q,r=document)=>r.querySelector(q), $$=(q,r=document)=>[...r.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(n,d=0)=>Number(n).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const colors={'밭':'#b4c57e','논':'#75a8bc','과수':'#d5a06b','시설':'#a995b7','비경지':'#b7bdae'};
const terrainColors={'곶자왈':'#507e60','오름':'#9b8762','하천':'#6d9fa6','숨골(수치지형도)':'#897998'};
const statusColors={'확인':'#6d9c8a','매립/멸실':'#c09a85','확인불가':'#b5b79f'};
const types=['밭','논','과수','시설','비경지'];
const iconPaths={
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/>',
 leaf:'<path d="M20 4C11 2 3 7 5 14s13 7 15-10Z"/><path d="M4 21 16 9M8 17v-5m0 5h5"/>',
 mountain:'<path d="m2 20 8-15 6 10 3-5 4 10H2Z"/><path d="m8 9 2 2 2-2"/>',
 water:'<path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8"/>',
 cursor:'<path d="m5 3 3 17 4-6 7-2L5 3Zm7 11 5 7"/>',
 chart:'<path d="M4 3v18h18M8 16v-5m5 5V7m5 9V4"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v14h5"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-7 6-7 12 0 18 7-6 7-12 0-18Z"/>'
};
const icon=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[n]||iconPaths.layers}</svg>`;
function hydrate(root=document){$$('[data-icon]',root).forEach(el=>el.innerHTML=icon(el.dataset.icon));}
const state={village:'harye',view:'map',metric:'area',includeNoncrop:false,layers:{agriculture:true,terrain:true,springs:true},types:new Set(types),opacity:.65,springStatus:'all',springUse:'all',terrainType:null,terrainLabels:true,selected:null,base:'light'};
let manifest,terrainCatalog,map,baseLayer,highlight,terrainLabelLayer,loadSequence=0,toastTimer,tileErrors=0;
const cache=new Map(),layers=new Map(),featureIndex=new Map();
const legendStorageKey='jeju-atlas-legend-hidden';
let legendHidden=false;
try{legendHidden=localStorage.getItem(legendStorageKey)==='true';}catch{}
const village=()=>manifest.villages.find(v=>v.id===state.village);
const scopeVillages=()=>state.village==='all'?manifest.villages:[village()];
const currentFeatures=kind=>scopeVillages().flatMap(v=>cache.get(v.id)?.[kind].features||[]);
function sumByType(vs=scopeVillages()){
 const out=Object.fromEntries(types.map(t=>[t,{count:0,area:0}]));
 for(const v of vs)for(const [t,a]of Object.entries(v.byType)){out[t].count+=a.count;out[t].area+=a.area;}
 return out;
}
function composition(vs=scopeVillages()){
 const byType=sumByType(vs),included=types.filter(t=>state.includeNoncrop||t!=='비경지'),denom=included.reduce((s,t)=>s+byType[t][state.metric],0);
 return {byType,included,denom,rows:included.map(t=>({type:t,value:byType[t][state.metric],percent:denom?byType[t][state.metric]/denom*100:0,...byType[t]}))};
}
const kindLabel=k=>({agriculture:'농지',terrain:'투수성 지형',springs:'용천수'}[k]);
const areaLabel=a=>a<100?num(a,2)+' ㎡':num(a/10000,2)+' ha';
function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
function statusClass(s){return s==='매립/멸실'?'lost':s==='확인불가'?'unknown':'';}
function statusPill(s){return `<span class="status-pill ${statusClass(s)}">${esc(s||'미기재')}</span>`;}
function initMap(){

 map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:8,maxZoom:19,zoomSnap:.25,scrollWheelZoom:true});
 for(const [name,z]of [['terrainPane',330],['agriculturePane',390],['boundaryPane',425],['springsPane',450],['walkingRoutePane',455],['selectionPane',470],['liveLocationPane',480],['guideConnectionsPane',485],['labelsPane',490],['guidePlacesPane',495]]){map.createPane(name);map.getPane(name).style.zIndex=z;}
 // Canvas renderers cover the map, even outside the highlighted geometry.
 // Selection decoration must never intercept clicks on markers below it.
 for(const name of ['selectionPane','guideConnectionsPane'])map.getPane(name).style.pointerEvents='none';
 L.control.scale({imperial:false,metric:true,position:'bottomleft',maxWidth:80}).addTo(map);
 map.attributionControl.setPrefix(false);map.attributionControl.addAttribution('마을 경계: 행정안전부 / Esri Korea');setBase('light');
 map.on('mousemove',e=>{$('#coordinate-readout').textContent=`${e.latlng.lat.toFixed(5)}° N, ${e.latlng.lng.toFixed(5)}° E`;});
 map.on('mouseout',()=>$('#coordinate-readout').textContent='');
 map.on('click',()=>{$('#search-results').hidden=true;});
 $('#zoom-in').onclick=()=>map.zoomIn();$('#zoom-out').onclick=()=>map.zoomOut();
 $('#fit-button').onclick=()=>fitScope(true);
 map.on('zoomend',renderTerrainLabels);
 map.on('zoomend',layoutGuideMarkers);
 $$('[data-base]').forEach(b=>b.onclick=()=>setBase(b.dataset.base));
 window.addEventListener('resize',()=>map.invalidateSize());
}
function setBase(base){
 state.base=base;$('#map').dataset.base=base;if(baseLayer)map.removeLayer(baseLayer);tileErrors=0;$('#tile-status').hidden=true;
 if(base!=='none'){
  const satellite=base==='satellite';
  baseLayer=L.tileLayer(satellite?'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}':'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{
   // The regional topographic cache is complete through level 13; overzoom it for closer views.
   maxZoom:19,maxNativeZoom:satellite?19:13,subdomains:'abcd',crossOrigin:true,
   attribution:satellite?'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics':'Tiles © Esri — Source: Esri, HERE, Garmin, Intermap, USGS'
  }).addTo(map);
  baseLayer.on('tileerror',()=>{if(++tileErrors>4)$('#tile-status').hidden=false;});
  baseLayer.on('tileload',()=>{$('#tile-status').hidden=true;});
 }
 $$('[data-base]').forEach(b=>{b.classList.toggle('active',b.dataset.base===base);b.setAttribute('aria-pressed',b.dataset.base===base);});
}
async function getData(v){
 if(!cache.has(v.id)){
  const r=await fetch(`data/${v.id}.json`);if(!r.ok)throw Error(`${v.name} 데이터를 불러오지 못했습니다.`);
  const d=await r.json();
  for(const f of d.terrain.features){const note=terrainCatalog?.records[f.id];if(note){f.properties.enrichment=note;f.properties.name=note.name||null;f.properties.aliases=note.aliases||[];}}
  cache.set(v.id,d);
  for(const kind of ['agriculture','terrain','springs'])for(const f of d[kind].features)featureIndex.set(f.id,f);
 }
 return cache.get(v.id);
}
function fitScope(allLayers=false){
 let b=L.latLngBounds([]);for(const v of scopeVillages())b.extend(v.bounds);
 extendGuideBounds(b,{includePlaces:allLayers});
 if(allLayers)for(const kind of ['terrain','agriculture','springs'])for(const f of currentFeatures(kind).filter(visible))if(f.geometry)b.extend(L.geoJSON(f).getBounds());
 if(b.isValid()){map.fitBounds(b,{padding:[30,45],maxZoom:14,animate:false});layoutGuideMarkers();}
}
async function selectVillage(id){
 const link=new URL(location.href);link.searchParams.set('village',id);history.replaceState(null,'',link);
 const seq=++loadSequence;state.village=id;state.selected=null;state.springStatus='all';state.springUse='all';state.terrainType=null;
 guideUI.category='all';guideUI.position='all';guideUI.selected=null;
 guideUI.mode='places';guideUI.routeId=null;
 $('#search').value='';$('#search-results').hidden=true;$('#map-loading').hidden=false;
 if(highlight){map.removeLayer(highlight);highlight=null;}map.closePopup();
 $('#selection-dot').hidden=true;
 $('#detail-content').innerHTML=`<div class="empty-detail"><span>${icon('cursor')}</span><h3>지도에서 하나를 선택하세요</h3><p>농지 구획, 지형, 용천수를 누르면<br>원본 속성과 위치를 확인할 수 있어요.</p></div>`;
 renderVillageButtons();renderHeading();renderMetrics();renderLayerControls();renderAnalysis();renderTerrainGuide();renderVillageGuide();setPanel('guide');
 if(state.view!=='map')setView('map');
 try{await Promise.all(scopeVillages().map(getData));if(seq!==loadSequence)return;renderMap();fitScope();renderAnalysis();renderTerrainGuide();renderVillageGuide();if($('#search').value.trim())search($('#search').value);}
 catch(e){toast(e.message);$('#tile-status').textContent=e.message;$('#tile-status').hidden=false;}
 finally{if(seq===loadSequence)$('#map-loading').hidden=true;}
}
function renderVillageButtons(){
 $('#village-buttons').innerHTML=`<button class="village-button overview ${state.village==='all'?'active':''}" data-village="all" aria-pressed="${state.village==='all'}"><strong>네 마을 전체</strong><small>제주도에서 보기 ↗</small></button>`+manifest.villages.map(v=>`<button class="village-button ${v.id===state.village?'active':''}" data-village="${v.id}" aria-pressed="${v.id===state.village}"><strong>${v.name}</strong><small>${v.district.replace('제주시 ','').replace('서귀포시 ','')}</small></button>`).join('');
 $$('[data-village]',$('#village-buttons')).forEach(b=>b.onclick=()=>selectVillage(b.dataset.village));
}
function renderHeading(){
 const all=state.village==='all',v=village();
 $('#village-title').textContent=all?'제주의 네 마을':v.name;$('#village-district').textContent=all?'저지 · 평대 · 하례 · 호근':v.district;
 $('#map-scope').textContent=all?'네 마을 전체':v.name;
 $('#village-description').textContent=all?'제주 곳곳에 놓인 네 마을의 농지와 물의 자취를 살펴보세요.':'마을의 농지와 지형, 물의 자취를 함께 살펴보세요.';
}
function renderMetrics(){
 const vs=scopeVillages(),area=vs.reduce((s,v)=>s+v.croplandArea,0),count=vs.reduce((s,v)=>s+v.counts.agriculture,0),springs=vs.reduce((s,v)=>s+v.counts.springs,0),terrain=vs.reduce((s,v)=>s+v.counts.terrain,0);
 const waterAvailable=vs.some(v=>v.springDataAvailable);
 $('#metrics').innerHTML=[
  ['leaf','농지 면적',num(area/10000,1),'ha','비경지 제외<br>구획 면적 합계'],
  ['layers','농지 레이어 구획',num(count),'개',`비경지 포함<br>지형 ${num(terrain)}개`],
  ['water','등록 용천수',waterAvailable?num(springs):'자료 없음',waterAvailable?'곳':'',waterAvailable?'':'']
 ].map(([i,l,n,u,desc])=>`<div class="metric"><span class="metric-icon">${icon(i)}</span><div><div class="metric-label">${l}</div><div class="metric-value">${n}<small>${u}</small></div></div><div class="metric-desc">${desc}</div></div>`).join('');
}
function renderLayerControls(){
 const vs=scopeVillages();$('#layer-controls').innerHTML=['agriculture','terrain','springs'].map((k,i)=>`<div class="layer-row"><span class="layer-icon ${k}">${icon(['leaf','mountain','water'][i])}</span><span class="layer-label">${kindLabel(k)}<small>${k==='springs'&&!vs.some(v=>v.springDataAvailable)?'자료 없음':num(vs.reduce((s,v)=>s+v.counts[k],0))+(k==='springs'?'곳':'개')}</small></span><label class="switch"><input type="checkbox" data-layer="${k}" aria-label="${kindLabel(k)} 레이어 표시" ${state.layers[k]?'checked':''}><span></span></label></div>`).join('');
 $$('[data-layer]').forEach(el=>el.onchange=()=>{state.layers[el.dataset.layer]=el.checked;renderMap();renderAnalysis();renderTerrainGuide();});
 $('#type-controls').innerHTML=types.map(t=>`<label class="type-control"><input type="checkbox" data-type="${t}" ${state.types.has(t)?'checked':''}><span class="swatch" style="background:${colors[t]}"></span>${t}</label>`).join('');
 $$('[data-type]').forEach(el=>el.onchange=()=>{if(el.checked)state.types.add(el.dataset.type);else state.types.delete(el.dataset.type);renderMap();});
 renderGuideControls();
}
function resetLayers(){state.layers={agriculture:true,terrain:true,springs:true};Object.assign(guideUI,{boundaries:true,places:true,category:'all'});state.types=new Set(types);state.opacity=.65;state.springStatus='all';state.springUse='all';state.terrainType=null;$('#opacity').value=65;$('#opacity-value').textContent='65%';renderLayerControls();renderMap();renderAnalysis();renderVillageGuide();}
function visible(f){
 const p=f.properties;if(!state.layers[p.kind])return false;
 if(p.kind==='agriculture')return state.types.has(p.type);
 if(p.kind==='terrain')return !state.terrainType||state.terrainType===p.type;
 return(state.springStatus==='all'||p.status===state.springStatus)&&(state.springUse==='all'||(p.use||'미기재')===state.springUse);
}
function featureTitle(f){const p=f.properties;return p.kind==='springs'?p.name:p.kind==='agriculture'?`${p.type} · ${p.id}`:`${p.name||p.type} · #${p.fid}`;}
function agriStyle(f){return{color:colors[f.properties.type],fillColor:colors[f.properties.type],fillOpacity:state.opacity,weight:.7,opacity:.9,pane:'agriculturePane'};}
function terrainStyle(f){const p=f.properties;return{color:terrainColors[p.type]||'#71866b',fillColor:terrainColors[p.type]||'#71866b',fillOpacity:.11,weight:p.type==='하천'?1.6:1.3,opacity:.75,dashArray:p.complete?null:'5 5',pane:'terrainPane'};}
function renderMap(){
 if(!map)return;
 for(const layer of layers.values())map.removeLayer(layer);layers.clear();
 let count=0;
 for(const kind of ['terrain','agriculture','springs']){
  const fs=currentFeatures(kind).filter(f=>f.geometry&&visible(f));count+=fs.length;
  if(!fs.length)continue;
  const layer=L.geoJSON({type:'FeatureCollection',features:fs},{
   pane:kind==='terrain'?'terrainPane':kind==='agriculture'?'agriculturePane':'springsPane',
   style:kind==='terrain'?terrainStyle:agriStyle,
   pointToLayer:(f,ll)=>L.marker(ll,{pane:'springsPane',keyboard:true,title:`${f.properties.name} · ${f.properties.status}`,riseOnHover:true,icon:L.divIcon({className:'spring-icon',html:`<span class="spring-pin ${statusClass(f.properties.status)}"></span>`,iconSize:[22,26],iconAnchor:[10,23]})}),
   onEachFeature:(f,l)=>{
    l.bindTooltip(esc(featureTitle(f)),{sticky:kind!=='springs',direction:'top',offset:[0,-12]});
    l.on('click',e=>{L.DomEvent.stopPropagation(e);selectFeature(f,{popup:true});});
   }
  }).addTo(map);layers.set(kind,layer);
 }
 if(state.village==='all'){
  const labels=L.layerGroup(manifest.villages.map(v=>{const b=L.latLngBounds(v.bounds);return L.marker(b.getCenter(),{pane:'labelsPane',keyboard:true,title:`${v.name} 탐색`,icon:L.divIcon({className:'village-label',html:`<div>${v.name} ↗</div>`,iconSize:[0,0]})}).on('click',()=>selectVillage(v.id));})).addTo(map);layers.set('labels',labels);
 }
 if(highlight)highlight.bringToFront?.();
 $('#visible-count').dataset.gisCount=count;
 renderGuideMap();renderLegend();renderTerrainLabels();
}
function featureCenter(f){
 const points=[];function visit(c){if(typeof c[0]==='number')points.push(c);else c.forEach(visit);}visit(f.geometry.coordinates);
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const [x,y]of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return [(minY+maxY)/2,(minX+maxX)/2];
}
function renderTerrainLabels(){
 if(!map)return;if(terrainLabelLayer){map.removeLayer(terrainLabelLayer);terrainLabelLayer=null;}
 if(!state.layers.terrain||!state.terrainLabels||map.getZoom()<11.5)return;
 const fs=currentFeatures('terrain').filter(f=>f.geometry&&f.properties.name&&visible(f));
 terrainLabelLayer=L.layerGroup(fs.map(f=>L.marker(featureCenter(f),{pane:'labelsPane',keyboard:true,title:featureTitle(f),icon:L.divIcon({className:'terrain-map-label',html:`<span>${esc(f.properties.enrichment.mapLabel||f.properties.name)}</span>`,iconSize:[0,0]})}).on('click',e=>{L.DomEvent.stopPropagation(e);selectFeature(f,{popup:true});}))).addTo(map);
}
const matchLabels={spatial:'위치 대조',area:'일대 연결',candidate:'명칭 후보',unresolved:'이름 미확인'};
function renderTerrainGuide(){
 if(!manifest)return;const fs=currentFeatures('terrain'),named=fs.filter(f=>f.properties.name).length;
 $('#terrain-content').innerHTML=`<div class="terrain-guide-heading"><span class="eyebrow">지형 이름</span><h2>이름으로 읽는 지형</h2><p>빗물이 땅속으로 스며드는 숨골·곶자왈 같은 지형을 이름과 이야기로 살펴보세요.</p></div><div class="terrain-guide-controls"><button id="fit-terrain">${icon('fit')}지형 전체 보기</button><label><input type="checkbox" id="terrain-label-toggle" ${state.terrainLabels?'checked':''}>지도에 이름 표시</label></div><p class="chart-note">이름은 지도를 확대하면 표시됩니다. 항목을 누르면 지도 위치·설명·출처를 볼 수 있어요.</p><div class="terrain-guide-list">${fs.map(f=>{const p=f.properties,n=p.enrichment||{},name=n.name||`${p.type.replace('(수치지형도)','')}`;return `<button class="terrain-guide-card" data-guide-feature="${f.id}"><div class="terrain-card-meta"><span>${esc(p.village)} · ${p.type.replace('(수치지형도)','')}</span><span class="match-badge ${n.match||'unresolved'}">${matchLabels[n.match]||'이름 미확인'}</span></div><h3>${esc(name)}</h3>${n.candidateName?`<p class="candidate-name">후보: ${esc(n.candidateName)}</p>`:''}<p>${esc(n.summary||'마을 지형 자료에 기록된 지형입니다.')}</p><div class="terrain-card-foot"><span>원본 #${p.fid}${p.complete?'':' · 좌표 일부 누락'}</span><span>자세히 ↗</span></div></button>`;}).join('')}</div>`;
 $('#fit-terrain').onclick=fitTerrain;
 $('#terrain-label-toggle').onchange=e=>{state.terrainLabels=e.target.checked;renderTerrainLabels();};
 $$('[data-guide-feature]').forEach(b=>b.onclick=()=>{const f=featureIndex.get(b.dataset.guideFeature);state.layers.terrain=true;state.terrainType=null;renderLayerControls();renderMap();selectFeature(f,{focus:true,popup:true});});
}
function fitTerrain(){
 state.layers.terrain=true;state.terrainType=null;renderLayerControls();renderMap();let b=L.latLngBounds([]);for(const f of currentFeatures('terrain'))if(f.geometry)b.extend(L.geoJSON(f).getBounds());if(b.isValid())map.fitBounds(b,{padding:[40,55],maxZoom:15,animate:false});
}
function syncLegendVisibility(focus=false){
 const legend=$('#map-legend'),button=$('#legend-open');
 legend.hidden=legendHidden;button.hidden=!legendHidden;
 button.setAttribute('aria-expanded',String(!legendHidden));
 if(focus)(legendHidden?button:$('#legend-close'))?.focus({preventScroll:true});
}
function setLegendHidden(hidden){
 legendHidden=hidden;
 try{localStorage.setItem(legendStorageKey,String(hidden));}catch{}
 syncLegendVisibility(true);
}
function renderLegend(){
 let html='<div class="legend-header"><h4>지도 읽기</h4><button id="legend-close" class="legend-close" type="button" aria-label="지도 읽기 닫기" title="지도 읽기 닫기">×</button></div>';
 if(state.layers.agriculture)html+=`<div class="legend-row">${[...state.types].map(t=>`<span class="swatch" style="background:${colors[t]}" title="${t}"></span>`).join('')}<span>농지 구획</span></div>`;
 if(state.layers.terrain)html+='<div class="legend-row"><span class="legend-line"></span>투수성 지형 경계</div>';
 if(scopeVillages().some(v=>v.incomplete.length)&&state.layers.terrain)html+='<div class="legend-row"><span class="legend-line" style="border-top-style:dashed;border-color:#aa9574"></span>경계 일부만 남은 지형</div>';
 if(state.layers.springs){for(const s of ['확인','매립/멸실','확인불가'])html+=`<div class="legend-row"><span class="legend-dot" style="background:${statusColors[s]};box-shadow:0 0 0 1px ${statusColors[s]}"></span>용천수 · ${s}</div>`;}
 if(!Object.values(state.layers).some(Boolean))html+='<div class="legend-row">모든 레이어가 꺼져 있습니다</div>';
 $('#map-legend').innerHTML=html;
 appendGuideLegend();
 $('#legend-close').onclick=()=>setLegendHidden(true);
 syncLegendVisibility();
}
function donut(data){
 const r=58,circ=2*Math.PI*r;let offset=0;
 return `<svg class="donut" viewBox="0 0 160 160" role="img" aria-label="농지 ${state.metric==='area'?'면적':'구획 수'} 구성"><circle cx="80" cy="80" r="${r}" stroke="#f1f3ed"/>${data.rows.filter(r=>r.value>0).map(row=>{const len=row.percent/100*circ,html=`<circle cx="80" cy="80" r="${r}" stroke="${colors[row.type]}" stroke-dasharray="${Math.max(0,len-1)} ${circ-Math.max(0,len-1)}" stroke-dashoffset="${-offset}"><title>${row.type} ${num(row.percent,1)}%</title></circle>`;offset+=len;return html;}).join('')}</svg>`;
}
function renderAnalysis(){
 if(!manifest)return;
 const comp=composition(),vs=scopeVillages(),springAvailable=vs.some(v=>v.springDataAvailable),ss=currentFeatures('springs'),status={};
 for(const v of vs)for(const [s,n]of Object.entries(v.byStatus))status[s]=(status[s]||0)+n;
 const totalSprings=Object.values(status).reduce((a,b)=>a+b,0),uses=[...new Set(vs.flatMap(v=>Object.keys(v.byUse)))];
 let waterList=ss.filter(visible),terrainTypes=[...new Set(vs.flatMap(v=>v.terrainTypes))],terrainCount=vs.reduce((s,v)=>s+v.counts.terrain,0),incomplete=vs.reduce((s,v)=>s+v.incomplete.length,0);
 const ts=currentFeatures('terrain').filter(f=>!state.terrainType||f.properties.type===state.terrainType);
 const fullName=state.village==='all'?'네 마을 전체':village().name;
 $('#analysis-content').innerHTML=`${state.village==='all'?'<div class="overview-hint">네 마을 자료를 합산한 통계입니다. 지도 위 마을 이름을 누르면 해당 마을로 이동합니다.</div>':''}
 <section class="panel-section"><div class="panel-title"><h2>농지 구성</h2><div class="segmented"><button data-metric="area" class="${state.metric==='area'?'active':''}">면적</button><button data-metric="count" class="${state.metric==='count'?'active':''}">구획 수</button></div></div>
 <p class="chart-note">${fullName} · ${state.metric==='area'?'구획 면적 합계':'원본 구획 수'} 기준</p>
 <div class="donut-wrap">${donut(comp)}<div class="donut-center"><strong>${num(state.metric==='area'?comp.denom/10000:comp.denom,state.metric==='area'?1:0)}</strong><small>${state.metric==='area'?'ha · 면적 합계':'개 · 구획 수'}</small></div></div>
 <div class="type-breakdown">${comp.rows.map(r=>`<button class="breakdown-row" data-focus-type="${r.type}" title="지도에서 ${r.type}만 표시"><span class="swatch" style="background:${colors[r.type]}"></span><span class="breakdown-label">${r.type}<small>${num(r.count)}개</small></span><span class="breakdown-value">${num(r.percent,1)}%<span class="breakdown-sub">${num(r.area/10000,2)} ha</span></span></button>`).join('')}</div>
 <label class="denominator-toggle"><input id="include-noncrop" type="checkbox" ${state.includeNoncrop?'checked':''}>비경지를 분모에 포함</label><p class="single-type-hint">유형을 누르면 지도에서 해당 유형만 표시합니다.</p></section>
 <section class="panel-section"><div class="panel-title"><h2>용천수</h2><span class="subtle">${springAvailable?totalSprings+'곳':'자료 없음'}</span></div>
 ${springAvailable?`<div class="status-bar" role="img" aria-label="용천수 위치확인 상태">${Object.entries(status).map(([s,n])=>`<span style="width:${n/totalSprings*100}%;background:${statusColors[s]}" title="${s} ${n}곳"></span>`).join('')}</div><div class="status-list">${Object.entries(status).map(([s,n])=>`<span><i class="status-color" style="background:${statusColors[s]}"></i>${s}<b>${n}</b></span>`).join('')}</div>
 <p class="water-disclaimer">조사 자료의 위치 확인 분류이며, 수질이나 현재 용출 상태와는 다릅니다.${state.village==='all'?' 저지리는 용천수 자료 미포함.':''}</p>
 <div class="filter-grid"><label>위치확인 상태<select id="spring-status" aria-label="용천수 위치확인 상태 필터"><option value="all">상태 전체</option>${Object.keys(status).map(s=>`<option value="${s}" ${state.springStatus===s?'selected':''}>${s}</option>`).join('')}</select></label><label>이용 용도<select id="spring-use" aria-label="용천수 이용 용도 필터"><option value="all">용도 전체</option>${uses.map(u=>`<option value="${u}" ${state.springUse===u?'selected':''}>${u}</option>`).join('')}</select></label></div>
 <p class="list-summary">지도에 표시 중인 용천수 ${waterList.length}곳</p><div class="spring-list">${waterList.length?waterList.map(f=>`<button class="spring-item" data-feature="${f.id}"><span><strong>${esc(f.properties.name)}</strong><small>${state.village==='all'?f.properties.village+' · ':''}${esc(f.properties.use||'용도 미기재')}</small></span>${statusPill(f.properties.status)}</button>`).join(''):`<p class="empty-message">${state.layers.springs?'현재 조건에 맞는 용천수가 없습니다.':'용천수 레이어가 꺼져 있습니다.'}</p>`}</div>`:
 '<p class="empty-message">이 마을의 용천수 자료가 원본에 들어 있지 않습니다. 용천수가 없다는 뜻은 아닙니다.</p>'}</section>
 <section class="panel-section"><div class="panel-title"><h2>투수성 지형</h2><span class="subtle">${terrainCount}개</span></div><div class="terrain-chips">${terrainTypes.map(t=>`<button class="terrain-chip ${state.terrainType===t?'active':''}" data-terrain-type="${t}">${t.replace('(수치지형도)','')}<b>${currentFeatures('terrain').filter(f=>f.properties.type===t).length}</b></button>`).join('')}</div>
 ${incomplete?`<p class="partial-note">${incomplete}개 지형은 좌표가 일부 잘려 있습니다. 남아 있는 경계만 점선으로 표시합니다.</p>`:''}
 <button class="terrain-guide-link" id="open-terrain-guide">지형 이름과 설명 살펴보기 ↗</button><div class="terrain-list">${ts.map(f=>`<button class="terrain-item" data-feature="${f.id}"><span>${esc(f.properties.name||f.properties.type.replace('(수치지형도)',''))} <small>#${f.properties.fid}</small></span><small>${f.properties.complete?areaLabel(f.properties.area):'일부 경계 ↗'}</small></button>`).join('')}</div><p class="chart-note">지형은 자료의 도형 단위이며, 마을 밖으로 이어질 수 있습니다. 지형 간 중첩을 제거한 면적이 아닙니다.</p></section>`;
 $('#open-terrain-guide').onclick=()=>{renderTerrainGuide();setPanel('terrain');};
 $$('[data-metric]',$('#analysis-content')).forEach(b=>b.onclick=()=>{state.metric=b.dataset.metric;renderAnalysis();});
 $('#include-noncrop').onchange=e=>{state.includeNoncrop=e.target.checked;renderAnalysis();};
 $$('[data-focus-type]').forEach(b=>b.onclick=()=>{const t=b.dataset.focusType;if(state.types.size===1&&state.types.has(t))state.types=new Set(types);else state.types=new Set([t]);state.layers.agriculture=true;renderLayerControls();renderMap();toast(state.types.size===1?`${t} 유형만 지도에 표시합니다.`:'모든 농지 유형을 표시합니다.');});
 for(const id of ['spring-status','spring-use'])if($('#'+id))$('#'+id).onchange=e=>{if(id==='spring-status')state.springStatus=e.target.value;else state.springUse=e.target.value;state.layers.springs=true;renderLayerControls();renderMap();renderAnalysis();};
 $$('[data-terrain-type]').forEach(b=>b.onclick=()=>{state.terrainType=state.terrainType===b.dataset.terrainType?null:b.dataset.terrainType;state.layers.terrain=true;renderLayerControls();renderMap();renderAnalysis();});
 $$('[data-feature]',$('#analysis-content')).forEach(b=>b.onclick=()=>{const f=featureIndex.get(b.dataset.feature);if(f)selectFeature(f,{focus:true,popup:true});});
}
function setPanel(panel){
 for(const key of ['guide','analysis','terrain','detail']){const active=key===panel;$('#'+key+'-content').hidden=!active;$('#'+key+'-tab').classList.toggle('active',active);$('#'+key+'-tab').setAttribute('aria-selected',active);}
}
function selectFeature(f,{focus=false,popup=false}={}){
 state.selected=f;guideUI.selected=null;const p=f.properties;
 updateGuideSelection();
 if(highlight)map.removeLayer(highlight);
 highlight=L.geoJSON(f,{pane:'selectionPane',interactive:false,style:{pane:'selectionPane',color:'#234f40',weight:3,fillOpacity:.16,dashArray:p.complete?null:'5 4'},pointToLayer:(ft,ll)=>L.circleMarker(ll,{pane:'selectionPane',radius:16,color:'#234f40',weight:2,fillOpacity:0})}).addTo(map);
 if(focus&&highlight.getBounds().isValid()){
  const b=highlight.getBounds();if(f.geometry.type==='Point')map.setView(b.getCenter(),Math.max(map.getZoom(),16),{animate:false});else map.fitBounds(b,{padding:[60,70],maxZoom:17,animate:false});
 }
 renderDetail(f);setPanel('detail');$('#selection-dot').hidden=false;
 if(popup){
  const center=f.geometry.type==='Point'?L.latLng(f.geometry.coordinates[1],f.geometry.coordinates[0]):highlight.getBounds().getCenter();
  L.popup({autoPan:true,closeButton:true,maxWidth:240}).setLatLng(center).setContent(`<strong>${esc(p.name||p.type)}</strong><small>${esc(p.village)} · ${kindLabel(p.kind)}</small>${p.kind==='springs'?`${esc(p.use||'용도 미기재')} · ${esc(p.status)}`:`${num(p.area,1)} ㎡${p.complete?'':'<small>좌표 일부 누락 · 남은 경계만 표시</small>'}`}${p.kind==='terrain'&&p.enrichment?`<small>설명은 선택 항목 탭에서 볼 수 있어요.</small>`:'<small>선택 항목 탭에서 자세한 정보를 볼 수 있어요.</small>'}`).openOn(map);
 }
 $('#search-results').hidden=true;
}
function renderEnrichment(p){
 const n=p.enrichment;if(!n)return '';
 return `<section class="terrain-description"><div class="enrichment-heading"><h3>지형 이야기</h3><span class="match-badge ${n.match}">${matchLabels[n.match]}</span></div>${n.aliases?.length?`<p class="terrain-aliases">다른 이름 · ${n.aliases.map(esc).join(' · ')}</p>`:''}${n.candidateName?`<p class="candidate-note">명칭 후보: ${esc(n.candidateName)}. 확정 이름으로 표시하지 않았습니다.</p>`:''}<p>${esc(n.summary)}</p>${(n.details||[]).map(s=>`<p>${esc(s)}</p>`).join('')}${n.facts?.length?`<dl class="terrain-facts">${n.facts.map(x=>`<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join('')}</dl>`:''}<details class="matching-details"><summary>이 도형에 이름을 연결한 근거</summary><p>${esc(n.spatialEvidence||'공개 자료만으로 개별 지명을 연결할 근거가 부족했습니다.')}</p>${n.caution?`<p>${esc(n.caution)}</p>`:''}</details><div class="terrain-sources"><h4>자료 출처</h4>${(n.sources||[]).length?n.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} <span>↗</span></a>`).join(''):'<p>이 도형의 개별명을 뒷받침하는 공개 자료를 확인하지 못했습니다.</p>'}</div><p class="enrichment-date">보충 정보 확인일 ${terrainCatalog.checkedAt} · 원본 속성과 구분해 추가</p></section>`;
}
function renderDetail(f){
 const p=f.properties,rows=[];
 if(p.kind==='springs')rows.push(['이용 용도',p.use||'미기재'],['위치확인 상태',p.status||'미기재'],['원본 용천수 번호',p.number],['경도 (WGS84)',`${num(f.geometry.coordinates[0],7)}° E`],['위도 (WGS84)',`${num(f.geometry.coordinates[1],7)}° N`],['원본 X_GRS80',num(p.x,4)],['원본 Y_GRS80',num(p.y,4)]);
 else rows.push(['유형',p.type],['면적',`${num(p.area/10000,2)} ha`],...(p.kind==='agriculture'?[]:[['둘레',`${num(p.perimeter,0)} m`]]));
 rows.push(['마을',p.village]);
 $('#detail-content').innerHTML=`<div class="detail-header"><span class="eyebrow">${kindLabel(p.kind)} DETAIL</span><h2>${esc(p.name||p.type)}</h2><p>${esc(p.village)} · ${p.kind==='agriculture'?'농지 레이어':p.kind==='terrain'?'투수성 지형 레이어':'용천수 레이어'}</p><div class="detail-tags">${p.kind==='springs'?statusPill(p.status):''}</div></div>
 ${p.kind==='terrain'?renderEnrichment(p):''}
 ${!p.complete?`<p class="partial-note">${esc(p.issue)}</p>`:''}
 <dl class="detail-table">${rows.map(([k,v])=>`<div class="detail-row"><dt>${esc(k)}</dt><dd>${esc(v??'미기재')}</dd></div>`).join('')}</dl>
 ${p.kind==='springs'?'<p class="chart-note">수질·담수/기수 구분·용출량·조사일 정보는 원본에 없습니다. ‘확인’은 원본의 위치확인 값입니다.</p>':''}
 <div class="detail-actions"><button id="focus-selected">${icon('fit')}지도에서 확대</button>${p.kind==='springs'?`<button id="copy-coordinates">${icon('copy')}좌표 복사</button>`:''}</div>
 <p class="source-reference">원본: ${esc(p.sourceSheet)} 시트 ${p.sourceRow}행<br>${p.kind==='agriculture'?'농지 (B–F열)':p.kind==='terrain'?'투수성 지형 (H–L열)':'용천수 (N–U열)'}<br>좌표계: EPSG:5186 추정 → EPSG:4326</p>`;
 $('#focus-selected').onclick=()=>selectFeature(f,{focus:true});
 $('#detail-content').scrollTop=0;
 if($('#copy-coordinates'))$('#copy-coordinates').onclick=async()=>{const s=`${f.geometry.coordinates[1]}, ${f.geometry.coordinates[0]}`;try{await navigator.clipboard.writeText(s);toast('위도, 경도를 복사했습니다.');}catch{toast(`위도, 경도: ${s}`);}};
}
function search(query){
 const box=$('#search-results'),q=query.trim().toLowerCase();if(!q){box.hidden=true;return;}
 const fs=['springs','terrain','agriculture'].flatMap(currentFeatures),matches=fs.filter(f=>[f.properties.name,f.properties.id,f.properties.type,f.properties.village,f.properties.fid,...(f.properties.aliases||[]),f.properties.enrichment?.candidateName].some(x=>x&&String(x).toLowerCase().includes(q))).slice(0,30);
 const guideMatches=scopedGuidePlaces().filter(p=>[p.name,...(p.aliases||[])].some(s=>s.toLowerCase().includes(q))).slice(0,20);
 box.innerHTML=(guideMatches.length||matches.length)?guideMatches.map(p=>`<button class="search-result" data-guide-result="${esc(p.id)}">${esc(p.name)}<small>${esc(p.villageName)} · 안내도 명소 · ${guideLocationLabel(p)}</small></button>`).join('')+matches.map(f=>`<button class="search-result" data-result="${f.id}">${esc(featureTitle(f))}<small>${f.properties.village} · ${kindLabel(f.properties.kind)}${f.properties.kind==='springs'?' · '+f.properties.status:''}</small></button>`).join(''):'<div class="no-results">선택 마을에서 검색 결과가 없습니다.</div>';
 box.hidden=false;$$('[data-result]',box).forEach(b=>b.onclick=()=>{const f=featureIndex.get(b.dataset.result);state.layers[f.properties.kind]=true;if(f.properties.kind==='agriculture')state.types.add(f.properties.type);if(f.properties.kind==='terrain')state.terrainType=null;renderLayerControls();renderMap();selectFeature(f,{focus:true,popup:true});});
 $$('[data-guide-result]',box).forEach(b=>b.onclick=()=>selectGuidePlace(b.dataset.guideResult,{focus:true,popup:true}));
}
function setView(view){
 state.view=view;const isMap=view==='map';$('#map-view').hidden=!isMap;$('#compare-view').hidden=isMap;$('#workspace').classList.toggle('compare-mode',!isMap);
 $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 if(isMap)setTimeout(()=>map.invalidateSize(),30);else renderCompare();
}
function renderCompare(){
 const all=composition(manifest.villages);
 $('#compare-view').innerHTML=`<span class="eyebrow">네 마을 비교</span><h1>네 마을의 물과 땅</h1><p class="compare-intro">마을마다 농지의 쓰임과 용천수의 기록은 어떻게 다를까요?<br>같은 계산 기준으로 네 마을을 나란히 살펴보세요.</p>
 <div class="compare-controls"><div class="segmented"><button data-compare-metric="area" class="${state.metric==='area'?'active':''}">면적 기준</button><button data-compare-metric="count" class="${state.metric==='count'?'active':''}">구획 수 기준</button></div><label class="denominator-toggle"><input id="compare-noncrop" type="checkbox" ${state.includeNoncrop?'checked':''}>비경지를 분모에 포함</label></div>
 <div class="compare-grid">${manifest.villages.map(v=>{
  const c=composition([v]);return `<article class="comparison-card"><div class="card-header"><div><h2>${v.name}</h2><small>${v.district}</small></div><button class="map-link" data-compare-village="${v.id}">지도에서 보기 ↗</button></div><div class="compare-number">${num(state.metric==='area'?c.denom/10000:c.denom,state.metric==='area'?1:0)}<small>${state.metric==='area'?'ha':'개'} · ${state.includeNoncrop?'비경지 포함':'비경지 제외'}</small></div><div class="stacked-chart" role="img" aria-label="${v.name} 농지 구성">${c.rows.map(r=>`<span style="width:${r.percent}%;background:${colors[r.type]}" title="${r.type} ${num(r.percent,1)}%"></span>`).join('')}</div><div class="compare-types">${c.rows.map(r=>`<span><i class="swatch" style="background:${colors[r.type]}"></i>${r.type}<b>${num(r.percent,1)}%</b></span>`).join('')}</div><div class="compare-water"><div><span>등록 용천수</span><strong>${v.springDataAvailable?v.counts.springs+'곳':'자료 없음'}</strong></div>${v.springDataAvailable?`<div class="status-list">${Object.entries(v.byStatus).map(([s,n])=>`<span><i class="status-color" style="background:${statusColors[s]}"></i>${s}<b>${n}</b></span>`).join('')}</div>`:'<p>이 마을의 용천수 위치 자료는 아직 담지 않았어요.</p>'}<p>투수성 지형 ${v.counts.terrain}개</p></div></article>`;
 }).join('')}</div>
 <div class="compare-table-wrap"><h2>농지 유형별 ${state.metric==='area'?'면적 (ha)':'구획 수 (개)'}</h2><table class="compare-table"><thead><tr><th>마을</th>${all.included.map(t=>`<th>${t}</th>`).join('')}<th>합계</th></tr></thead><tbody>${manifest.villages.map(v=>{const c=composition([v]);return `<tr><td>${v.name}</td>${c.rows.map(r=>`<td>${num(state.metric==='area'?r.area/10000:r.count,state.metric==='area'?2:0)}</td>`).join('')}<td>${num(state.metric==='area'?c.denom/10000:c.denom,state.metric==='area'?2:0)}</td></tr>`;}).join('')}</tbody></table><p class="small-note">면적은 마을별 농지 구획의 면적을 합산한 값으로, 전체 마을 면적 대비 비율이 아닙니다.</p></div>`;
 $$('[data-compare-metric]').forEach(b=>b.onclick=()=>{state.metric=b.dataset.compareMetric;renderCompare();renderAnalysis();});
 $('#compare-noncrop').onchange=e=>{state.includeNoncrop=e.target.checked;renderCompare();renderAnalysis();};
 $$('[data-compare-village]').forEach(b=>b.onclick=()=>selectVillage(b.dataset.compareVillage));
}
function renderInfo(){
 $('#info-content').innerHTML=`<section><h3>업로드한 자료를 지도에 담았습니다</h3><p>${esc(manifest.source)}</p><p>저지리·평대리·하례리·호근동의 농지 ${num(manifest.totals.agriculture)}개, 투수성 지형 ${manifest.totals.terrain}개, 용천수 ${manifest.totals.springs}개를 모두 수록했습니다. 데이터 준비일은 ${manifest.preparedAt}이며, 원본 조사일은 기재되어 있지 않습니다.</p></section>
 <section><h3>농지 비율의 분모</h3><p><b>면적 기준:</b> 선택 유형의 AREA 합계 ÷ 선택 마을의 포함 유형 전체 AREA 합계 × 100. 면적 단위는 원본 도형 좌표의 m 단위와 AREA 값에 따라 ㎡로 적용했으며, 1 ha = 10,000 ㎡로 환산했습니다.</p><p><b>구획 수 기준:</b> 해당 유형의 행 수 ÷ 포함 유형 전체 행 수 × 100. 기본값은 비경지를 제외하며 ‘비경지를 분모에 포함’ 옵션으로 바꿀 수 있습니다. 논이 없는 시트는 논 0%로 표시합니다.</p><p>상단 농지 면적은 비경지를 제외합니다. 지도 필터는 지도 표시만 바꾸며, 마을 통계의 전체 모집단을 바꾸지 않습니다. 원본 구획 ID와 행을 유지했습니다.</p></section>
 <section><h3>용천수의 분류와 빈 자료</h3><p>‘용도’는 상수원·생활용·농업용·미이용 등의 원본 값입니다. 빈칸은 ‘미기재’로 구분했습니다. ‘확인 / 매립·멸실 / 확인불가’는 원본 ‘위치확인’ 열의 값이며 수질이나 현재 용출 상태를 나타내지 않습니다.</p><p>저지리 시트에는 용천수 자료가 없습니다. 용천수가 없다고 판정하지 않았습니다. 담수·기수 등 수문 유형, 수질, 용출량, 조사일은 제공되지 않았습니다.</p></section>
 <section><h3>좌표계는 원본 확인이 필요합니다</h3><p>${esc(manifest.crs.description)}</p><p>웹지도는 EPSG:4326 경위도로 변환했습니다. <a href="${manifest.crs.reference}" target="_blank" rel="noopener">OGC의 EPSG:5186 정의 보기 ↗</a></p></section>
 <section><h3>지형 5개의 좌표가 중간에 잘려 있습니다</h3><p>아래 도형은 엑셀 셀의 32,767자 길이에 도달하면서 좌표 문자열이 끝납니다. 남아 있는 좌표 구간만 열린 점선으로 표시했습니다. 누락된 경계와 면적을 추정해 채우지 않았습니다. 원본 AREA 속성은 그대로 제공합니다.</p><table class="quality-table"><thead><tr><th>마을</th><th>유형</th><th>fid</th><th>원본 행</th></tr></thead><tbody>${manifest.villages.flatMap(v=>v.incomplete.map(x=>`<tr><td>${v.name}</td><td>${x.type}</td><td>${x.fid}</td><td>${x.row}</td></tr>`)).join('')}</tbody></table><p class="small-note">온전한 지형을 표시하려면 원본 GIS 도형을 GeoPackage(.gpkg)나 GeoJSON으로 제공하면 됩니다.</p></section>
 <section><h3>마을 경계와 지형 면적</h3><p>마을 외곽선은 원본 엑셀과 별도로 추가한 법정구역 참조 경계입니다. 행정안전부 주소기반산업지원서비스 원자료를 제공하는 Esri Korea의 법정리·법정동 레이어를 사용했습니다(공급자 기준 2026년 7월, 조회 2026-10-24). 저지리·평대리·하례리는 법정리, 호근동은 법정동 경계입니다. 그림지도상의 탐방 범위나 생물권보전지역 경계를 뜻하지 않습니다.</p><p>원본 GIS의 마을 분류와 통계는 엑셀 시트를 그대로 따릅니다. 지형을 마을선으로 자르거나 면적을 재계산하지 않았습니다. 지형은 마을 밖으로 이어지거나 서로 겹칠 수 있어 합계를 마을 면적이나 투수율로 해석하지 않았습니다.</p><p><a href="https://www.arcgis.com/home/item.html?id=37bf7934ebd64f769393e2b999b333df" target="_blank" rel="noopener">법정리 경계 출처 ↗</a> · <a href="https://www.arcgis.com/home/item.html?id=2b96b3df77c9453d9817a0d0d4025d06" target="_blank" rel="noopener">법정동 경계 출처 ↗</a></p></section>
 <section><h3>생태관광 장소·사진·걷기 코스</h3><p>첨부한 네 마을 안내도 속 장소 88개를 같은 지도·카드 형식으로 정리했습니다. 88개 항목을 전수 조사해 ${villageGuideCatalog.reviewTotals.mapped}곳을 지도에 연결했습니다. 출처 좌표 ${villageGuideCatalog.reviewTotals.statuses.documented}·주소 기반 ${villageGuideCatalog.reviewTotals.statuses.address}·구역 및 접근점 ${villageGuideCatalog.reviewTotals.statuses.area}·후보 ${villageGuideCatalog.reviewTotals.statuses.candidate}곳을 구분하며, ${villageGuideCatalog.reviewTotals.statuses.unresolved}곳은 좌표를 더 확인해야 합니다. 현장 GPS 실측을 뜻하지 않습니다. 사진은 제공 안내도와 해당 장소의 공식 관광 자료에서 가져왔으며 개별 카드에 출처를 표시합니다.</p><p>안내도 탐방길은 원본의 길 이름과 연결되는 지역 GPS 4개 구간과 별도 연계 답사 기록 1개로 구분합니다. 고살리숲길은 공개 도보 기록에서 해당 구간을 추출했습니다. 올레 20·7-1은 마을 경계 안 부분, 올레 7은 원본에 수록된 속골–외돌개 해안만 표시합니다. 원본 길의 GPS를 확보하지 못한 경우 다른 코스로 대신하지 않습니다. 공개 좌표 기록의 측정 거리는 원본 안내 거리와 다를 수 있습니다.</p><p>‘내 위치’는 버튼을 누르고 기기의 위치 권한을 허용할 때만 표시하며 위치를 서버로 전송·저장하지 않습니다. 안내도에는 마을 경계 밖 연계 장소와 과거 시설도 포함됩니다. 상세 카드에서 위치의 성격과 확인 근거를 함께 읽어주세요.</p></section>
 <section><h3>조사해 보충한 지형 이름과 설명</h3><p>지형 안내에는 제주특별자치도·제주관광공사·국가 생태관광 자료의 명칭과 설명을 추가했습니다. 공개지도의 지명점·하천 선형을 원본 도형과 대조한 부분은 ‘위치 대조’, 넓거나 불완전한 도형에 주변 지형을 연결한 부분은 ‘일대 연결’로 표시합니다. 확정할 수 없는 명칭은 ‘명칭 후보’, 대응 근거가 없는 것은 ‘이름 미확인’으로 남겼습니다.</p><p>보충 이름은 원본 속성에 없던 정보입니다. 공식 지정 경계나 법정 하천구역을 새로 확인했다는 의미가 아니며, 원본 도형 하나가 여러 지명이나 잘린 산체를 포함할 수 있습니다. ‘투수성 지형’은 원본 유형으로 실제 투수율 측정값을 뜻하지 않습니다.</p><p>확인일: ${terrainCatalog.checkedAt}. 각 지형의 설명과 연결 근거 아래에 자료 출처를 제공합니다. 위치 대조에 사용한 일부 지명·선형은 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors, ODbL</a> 자료입니다.</p></section>
 <section><h3>배경지도</h3><p>기본지도는 Esri World Topographic Map, 위성영상은 Esri World Imagery를 사용합니다. 인터넷 연결이 필요하며 지도·영상 시점은 레이어마다 다릅니다. ‘도형만’으로 배경을 끄고 원본 자료만 살펴볼 수 있습니다.</p></section>`;
}
function download(name,data,mime){const blob=new Blob([data],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function csv(rows){return '\uFEFF'+rows.map(r=>r.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');}
async function exportData(type){
 try{
  if(type==='summary'){
   const rows=[['마을','농지유형','면적_㎡','면적_ha','구획수','면적비율_%','구획비율_%','분모','조사일','자료준비일']];
   for(const v of manifest.villages){const by=v.byType,inc=types.filter(t=>state.includeNoncrop||t!=='비경지'),area=inc.reduce((a,t)=>a+(by[t]?.area||0),0),count=inc.reduce((a,t)=>a+(by[t]?.count||0),0);for(const t of inc){const a=by[t]?.area||0,n=by[t]?.count||0;rows.push([v.name,t,a,a/10000,n,area?a/area*100:0,count?n/count*100:0,state.includeNoncrop?'비경지 포함':'비경지 제외','미기재',manifest.preparedAt]);}}
   download('제주_마을별_농지_요약.csv',csv(rows),'text/csv;charset=utf-8');
  }else{
   await Promise.all(scopeVillages().map(getData));
   const name=state.village==='all'?'네마을':village().name;
   if(type==='springs'){
    const rows=[['마을','용천수명','용도','위치확인','번호','원본_X_GRS80','원본_Y_GRS80','위도_WGS84','경도_WGS84','원본행','원본CRS','CRS확인상태']];
    for(const f of currentFeatures('springs')){const p=f.properties;rows.push([p.village,p.name,p.use||'미기재',p.status,p.number,p.x,p.y,f.geometry.coordinates[1],f.geometry.coordinates[0],p.row,'EPSG:5186','추정·원본 확인 필요']);}
    download(`제주_${name}_용천수.csv`,csv(rows),'text/csv;charset=utf-8');
   }else if(type==='terrain'){
    const rows=[['마을','fid','원본유형','보충명칭','명칭상태','명칭후보','별칭','설명','대조근거','주의','출처URL','확인일']];
    for(const f of currentFeatures('terrain')){const p=f.properties,n=p.enrichment||{};rows.push([p.village,p.fid,p.type,n.name||'',matchLabels[n.match]||'이름 미확인',n.candidateName||'',(n.aliases||[]).join(' · '),n.summary||'',n.spatialEvidence||'',n.caution||'',(n.sources||[]).map(s=>s.url).join(' '),terrainCatalog.checkedAt]);}
    download(`제주_${name}_지형_이름과설명.csv`,csv(rows),'text/csv;charset=utf-8');
   }else{
    const features=['agriculture','terrain','springs'].flatMap(currentFeatures);
    download(`제주_${name}_환경지도.geojson`,JSON.stringify({type:'FeatureCollection',name:`${name} 환경지도`,source:manifest.source,coordinateSystem:'EPSG:4326',sourceCrs:manifest.crs,terrainEnrichment:{checkedAt:terrainCatalog.checkedAt,method:terrainCatalog.method,attribution:terrainCatalog.attribution},notes:'불완전한 지형은 원본에서 확인되는 경계 구간만 MultiLineString으로 수록. 보충 지형 이름과 설명은 properties.enrichment에 수록. 외부 참조용 마을 경계와 안내도 장소는 이 GIS 내보내기에 포함하지 않습니다. 장소 목록은 별도 CSV에서 받을 수 있습니다.',features}), 'application/geo+json');
   }
  }
  $('#export-dialog').close();toast('자료를 내보냈습니다.');
 }catch(e){toast('자료를 내보내지 못했습니다. '+e.message);}
}
function wire(){
 $('#legend-open').onclick=()=>setLegendHidden(false);
 $('[data-export="geojson"]').insertAdjacentHTML('beforebegin',`<button class="export-option" data-export="terrain"><span data-icon="mountain"></span><span><strong>지형 이름·설명 CSV</strong><small>선택 마을의 명칭·별칭·대조 근거·출처</small></span><span>↓</span></button>`);
 hydrate();$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
 $('.brand').onclick=e=>{e.preventDefault();selectVillage('harye');};
 for(const id of ['method-button','quality-button'])$('#'+id).onclick=()=>$('#info-dialog').showModal();
 $('#export-button').onclick=()=>{$('#export-scope').textContent=`선택 범위: ${state.village==='all'?'네 마을 전체':village().name}`;$('#export-dialog').showModal();};
 $$('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
 $$('[data-export]').forEach(b=>b.onclick=()=>exportData(b.dataset.export));
 $('#analysis-tab').onclick=()=>{renderAnalysis();setPanel('analysis');};$('#terrain-tab').onclick=()=>{renderTerrainGuide();setPanel('terrain');};$('#detail-tab').onclick=()=>setPanel('detail');
 $('#reset-layers').onclick=resetLayers;
 $('#opacity').oninput=e=>{state.opacity=+e.target.value/100;$('#opacity-value').textContent=e.target.value+'%';layers.get('agriculture')?.setStyle(agriStyle);};
 $('#search').oninput=e=>search(e.target.value);$('#search').onfocus=e=>{if(e.target.value)search(e.target.value);};
 $('#search').onkeydown=e=>{if(e.key==='Escape')$('#search-results').hidden=true;if(e.key==='Enter')$('.search-result',$('#search-results'))?.click();};
 document.addEventListener('click',e=>{if(!e.target.closest('.map-search'))$('#search-results').hidden=true;});
}
async function main(){
 try{const [r,t]=await Promise.all([fetch('data/manifest.json'),fetch('data/terrain-notes.json')]);if(!r.ok||!t.ok)throw Error('데이터 목록 또는 지형 안내를 불러오지 못했습니다.');[manifest,terrainCatalog]=await Promise.all([r.json(),t.json()]);await loadVillageGuides();wire();wireVillageGuides();initMap();renderInfo();const requestedVillage=new URLSearchParams(location.search).get('village');await selectVillage(['all',...manifest.villages.map(v=>v.id)].includes(requestedVillage)?requestedVillage:'harye');}
 catch(e){$('#map-loading').innerHTML=`<p class="fatal-error">${esc(e.message)}<br>새로고침해서 다시 시도해 주세요.</p>`;console.error(e);}
}
main();
