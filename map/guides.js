'use strict';
// The illustrated guide has its own image coordinate system. Its hotspots are
// deliberately never interpreted as longitude/latitude or a measured route.
let villageGuideCatalog, boundaryCatalog, walkingRouteCatalog, boundaryDisplay, guidePlaceDisplay, walkingRouteDisplay;
let locationWatch=null, liveLocationDisplay=null, lastLocation=null;
let illustrationMap, illustrationOverlay, illustrationMarkers, illustrationVillage='harye', illustrationPage=1, illustrationSelected=null;
const guidePlaceIndex=new Map();
const guideMarkerIndex=new Map();
let guideConnections;
// Offsets are screen pixels only. The original coordinates stay unchanged.
const guidePinCandidates=[];
for(let x=-10;x<=10;x++)for(let y=-10;y<=10;y++)guidePinCandidates.push(L.point(x*38,y*38));
guidePinCandidates.sort((a,b)=>(a.x*a.x+a.y*a.y)-(b.x*b.x+b.y*b.y));
const guideUI={boundaries:true,places:true,category:'all',position:'all',selected:null,mode:'places',routeId:null};
const guideCategories={nature:{label:'숲·지형',color:'#567e60',symbol:'♧'},water:{label:'물·해안',color:'#4e8c9d',symbol:'≈'},culture:{label:'역사·문화',color:'#9d7951',symbol:'◇'},community:{label:'마을 공간',color:'#85759a',symbol:'⌂'},experience:{label:'체험·먹거리',color:'#b1844e',symbol:'✦'}};
const boundaryColors={jeoji:'#a76b46',pyeongdae:'#947c34',harye:'#507b8e',hogeun:'#88729c'};
async function loadVillageGuides(){
 const responses=await Promise.all([fetch('data/village-guides.json'),fetch('data/village-boundaries.json'),fetch('data/walking-routes.json')]);
 if(responses.some(r=>!r.ok))throw Error('마을 안내도 또는 마을 경계를 불러오지 못했습니다.');
 [villageGuideCatalog,boundaryCatalog,walkingRouteCatalog]=await Promise.all(responses.map(r=>r.json()));
 for(const v of villageGuideCatalog.villages)for(const p of v.places)guidePlaceIndex.set(p.id,p);
}
const guideFor=id=>villageGuideCatalog?.villages.find(v=>v.id===id);
const scopedGuidePlaces=()=>scopeVillages().flatMap(v=>guideFor(v.id)?.places||[]);
const scopedBoundaries=()=>boundaryCatalog?.features.filter(f=>scopeVillages().some(v=>v.id===f.id))||[];
function guideFilteredPlaces(){return scopedGuidePlaces().filter(p=>(guideUI.category==='all'||p.category===guideUI.category)&&(guideUI.position==='all'||p.reviewStatus===guideUI.position));}
function guideLinks(p){return (p.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('');}
const locationTypeLabels={site:'시설·장소 대표점',area:'구역 대표점',landform:'지형 대표점',spring:'원본 용천수 지점',heritage:'유적 대표점',entrance:'입구 위치',representative:'자료의 대표 위치',historic:'과거 공간의 건물 위치',address:'주소 대표점',access:'접근 기준점',candidate:'위치 후보',unresolved:'핀 추가 확인'};
const positionLabels={documented:'출처 좌표',address:'주소 기반',area:'구역·접근점',candidate:'위치 후보',unresolved:'핀 추가 확인'};
function guideLocationLabel(p){return p.coordinates?`${p.reviewStatus==='candidate'&&p.locationType!=='candidate'?'후보 · ':''}${locationTypeLabels[p.locationType]||'대표 위치'}`:(p.address?'주소 확인 · 핀 추가 확인':'핀 추가 확인');}
function positionSummary(places){return `<div class="position-summary" aria-label="위치 자료 구분">${Object.entries(positionLabels).map(([key,label])=>{const n=places.filter(p=>p.reviewStatus===key).length;return n?`<span class="position-tag position-${key}">${label} <b>${n}</b></span>`:'';}).join('')}</div>`;}
function scopedWalkingRoutes(){return walkingRouteCatalog?.features.filter(f=>state.village==='all'||f.properties.villages.includes(state.village))||[];}
function currentWalkingRoute(){return walkingRouteCatalog?.features.find(f=>f.id===guideUI.routeId);}
function guidePhoto(p){
 if(!p.photo)return '';
 const x=p.photo;return `<figure class="place-photo"><img src="${esc(x.url)}" alt="${esc(x.alt)}" width="${x.width}" height="${x.height}" loading="lazy"><figcaption>${esc(x.caption)}<br>${x.sourceUrl?`<a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">${esc(x.credit)} ↗</a>`:esc(x.credit)}</figcaption></figure>`;
}
function guideNumber(p){return p.number||'·';}
function renderGuideControls(){
 if(!villageGuideCatalog)return;
 const n=scopedGuidePlaces().filter(p=>p.coordinates).length;
 $('#guide-layer-controls').innerHTML=`<div class="guide-layer-row"><span class="boundary-symbol"></span><span>마을 외곽선<small>법정구역 경계</small></span><label class="switch"><input id="boundary-toggle" type="checkbox" aria-label="마을 외곽선 표시" ${guideUI.boundaries?'checked':''}><span></span></label></div><div class="guide-layer-row"><span class="place-symbol">✦</span><span>마을 명소<small>지도 연결 ${n}곳</small></span><label class="switch"><input id="guide-place-toggle" type="checkbox" aria-label="마을 안내도 명소 표시" ${guideUI.places?'checked':''}><span></span></label></div>`;
 $('#boundary-toggle').onchange=e=>{guideUI.boundaries=e.target.checked;renderGuideMap();renderLegend();};
 $('#guide-place-toggle').onchange=e=>{guideUI.places=e.target.checked;renderGuideMap();renderLegend();};
}
function appendGuideLegend(){
 if(!villageGuideCatalog)return;
 let html='';
 if(guideUI.boundaries)html+='<div class="legend-row"><span class="boundary-legend-line"></span>마을 외곽선 · 법정구역</div>';
 if(guideUI.places)html+='<div class="legend-row"><span class="guide-legend-dot"></span>안내도 명소 · 출처 좌표 / ◌ 구역·접근 / ◇ 후보</div><div class="legend-row">겹친 번호는 펼쳐 표시 · 연결선 끝이 기준 위치</div>';
 const route=currentWalkingRoute();if(route)html+=`<div class="legend-row"><span class="gps-legend-line" style="background:${route.properties.color}"></span>${esc(route.properties.name)} · GPS 기반</div>`;
 $('#map-legend').insertAdjacentHTML('beforeend',html);
}
function renderGuideMap(){
 if(!map||!villageGuideCatalog)return;
 if(boundaryDisplay)map.removeLayer(boundaryDisplay);
 if(guidePlaceDisplay)map.removeLayer(guidePlaceDisplay);
 if(guideConnections)map.removeLayer(guideConnections);
 guideMarkerIndex.clear();
 if(guideUI.boundaries){
  const fc={type:'FeatureCollection',features:scopedBoundaries()};
  const halo=L.geoJSON(fc,{pane:'boundaryPane',interactive:false,style:{pane:'boundaryPane',color:'#fff',weight:6.5,opacity:.95,fill:false}});
  const outline=L.geoJSON(fc,{pane:'boundaryPane',style:f=>({pane:'boundaryPane',color:boundaryColors[f.id],weight:3,opacity:.98,fill:false}),onEachFeature:(f,l)=>{
   l.bindTooltip(`${esc(f.properties.name)} · ${esc(f.properties.boundaryType)} 경계`,{sticky:true});
   l.on('click',e=>{L.DomEvent.stopPropagation(e);showVillageBoundary(f.id);});
  }});
  boundaryDisplay=L.layerGroup([halo,outline]).addTo(map);
 }
 if(guideUI.places){
  guideConnections=L.layerGroup().addTo(map);
  guidePlaceDisplay=L.layerGroup(guideFilteredPlaces().filter(p=>p.coordinates).map(p=>{
   const marker=L.marker([p.coordinates[1],p.coordinates[0]],{pane:'guidePlacesPane',keyboard:true,autoPanOnFocus:false,bubblingMouseEvents:false,title:`${p.villageName} · ${p.name} · ${guideLocationLabel(p)}`,alt:`${guideNumber(p)}번 ${p.name}`,riseOnHover:true,icon:guideMarkerIcon(p,L.point(0,0))}).bindTooltip(`${esc(p.name)} · ${esc(guideLocationLabel(p))}`,{direction:'top',offset:[0,-22]}).on('click',e=>{L.DomEvent.stopPropagation(e);selectGuidePlace(p.id,{popup:true});});
   marker.guideOffset=L.point(0,0);marker.on('add',updateGuideSelection);guideMarkerIndex.set(p.id,marker);return marker;
  })).addTo(map);
  layoutGuideMarkers();updateGuideSelection();
 }
 const gisCount=$('#visible-count').dataset.gisCount;
 if(gisCount!=null)$('#visible-count').textContent=`GIS ${num(gisCount)}개${guideUI.places?' · 명소 '+guideFilteredPlaces().filter(p=>p.coordinates).length+'곳':''} · 통계는 전체 자료 기준`;
 renderWalkingRoute();
}
function guideMarkerIcon(p,offset){
 const category=guideCategories[p.category]||guideCategories.nature;
 return L.divIcon({className:'guide-place-icon',html:`<span style="--place-color:${category.color}" class="guide-pin position-${p.reviewStatus} ${guideUI.selected===p.id?'selected':''}"><b>${esc(guideNumber(p))}</b></span>`,iconSize:[36,36],iconAnchor:[18-offset.x,18-offset.y]});
}
function updateGuideSelection(){
 for(const [id,marker]of guideMarkerIndex){
  const el=marker.getElement();if(!el)continue;
  el.dataset.guideMarker=id;el.setAttribute('aria-pressed',String(guideUI.selected===id));
  el.querySelector('.guide-pin').classList.toggle('selected',guideUI.selected===id);
  marker.setZIndexOffset(guideUI.selected===id?1000:0);
 }
}
function layoutGuideMarkers(){
 if(!map||!guideConnections||!Number.isFinite(map.getZoom()))return;
 guideConnections.clearLayers();const occupied=[],size=map.getSize();
 for(const [id,marker]of guideMarkerIndex){
  const p=guidePlaceIndex.get(id),origin=map.project(marker.getLatLng(),map.getZoom());
  const screen=map.latLngToContainerPoint(marker.getLatLng()),inside=screen.x>=0&&screen.y>=0&&screen.x<=size.x&&screen.y<=size.y;
  const offset=guidePinCandidates.find(d=>{const q=origin.add(d),v=screen.add(d);return (!inside||(v.x>=20&&v.x<=size.x-20&&v.y>=20&&v.y<=size.y-42))&&occupied.every(s=>Math.abs(s.x-q.x)>=38||Math.abs(s.y-q.y)>=38);})||L.point(0,0);
  const point=origin.add(offset);occupied.push(point);
  if(!marker.guideOffset.equals(offset)){marker.guideOffset=offset;marker.setIcon(guideMarkerIcon(p,offset));}
  if(offset.x||offset.y){
   L.polyline([marker.getLatLng(),map.unproject(point,map.getZoom())],{pane:'guideConnectionsPane',interactive:false,color:'#6e8073',weight:1.5,opacity:.75,dashArray:'3 3'}).addTo(guideConnections);
   L.circleMarker(marker.getLatLng(),{pane:'guideConnectionsPane',interactive:false,radius:2.5,weight:1,color:'#fff',fillColor:'#526e5b',fillOpacity:1}).addTo(guideConnections);
  }
 }
 updateGuideSelection();
}
function revealGuidePopup(popup){
 // Move synchronously: an animated auto-pan can move the next number away
 // between a visitor's press and release during quick successive selections.
 const frame=map.getContainer().getBoundingClientRect(),box=popup.getElement().getBoundingClientRect();
 const dx=Math.max(0,box.right-frame.right+16)-Math.max(0,frame.left+16-box.left);
 const topPadding=matchMedia('(max-width:600px)').matches?110:72;
 const dy=Math.max(0,box.bottom-frame.bottom+24)-Math.max(0,frame.top+topPadding-box.top);
 if(dx||dy)map.panBy([dx,dy],{animate:false});
}
function extendGuideBounds(bounds,{includePlaces=false}={}){
 for(const f of scopedBoundaries())bounds.extend(L.geoJSON(f).getBounds());
 if(includePlaces&&guideUI.places)for(const p of guideFilteredPlaces())if(p.coordinates)bounds.extend([p.coordinates[1],p.coordinates[0]]);
 return bounds;
}
function fitVillageBoundary(id){
 const f=boundaryCatalog.features.find(f=>f.id===id);if(!f)return;
 guideUI.boundaries=true;renderGuideControls();renderGuideMap();renderLegend();map.fitBounds(L.geoJSON(f).getBounds(),{padding:[45,55],maxZoom:14,animate:false});
 layoutGuideMarkers();
}
function showVillageBoundary(id){
 const f=boundaryCatalog.features.find(f=>f.id===id),p=f.properties;
 if(state.village==='all'){selectVillage(id);return;}
 $('#detail-content').innerHTML=`<div class="detail-header"><span class="eyebrow">VILLAGE BOUNDARY</span><h2>${esc(p.name)}의 외곽선</h2><p>${esc(p.district)} · ${esc(p.boundaryType)}</p></div><div class="guide-detail-copy"><p>행정안전부 주소 자료를 바탕으로 제공되는 법정구역 경계입니다. 농지 구획이나 지형의 외곽을 이어 그린 선이 아닙니다.</p><p>안내도에 소개된 장소는 이 경계 밖의 주변 연계 장소를 포함할 수 있어요.</p></div><dl class="detail-table"><div class="detail-row"><dt>법정구역 코드</dt><dd>${esc(p.code)}</dd></div><div class="detail-row"><dt>공급자 자료 기준</dt><dd>${esc(p.referenceDate)}</dd></div><div class="detail-row"><dt>조회일</dt><dd>${esc(p.retrievedAt)}</dd></div></dl><div class="detail-actions"><button id="fit-village-boundary">${icon('fit')}마을 전체 보기</button><button id="boundary-illustration">그림지도 보기 ↗</button></div><div class="terrain-sources"><h4>경계 자료 출처</h4><a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">${esc(p.sourceTitle)} ↗</a><p>${esc(p.provider)}</p></div><p class="chart-note">마을선은 참조 자료입니다. 원본 GIS의 지형을 이 선으로 자르거나 농지 통계의 분모를 바꾸지 않았습니다.</p>`;
 $('#fit-village-boundary').onclick=()=>fitVillageBoundary(id);$('#boundary-illustration').onclick=()=>openIllustration(id);setPanel('detail');$('#selection-dot').hidden=false;
}
function villageGuideGraphic(v){
 const f=boundaryCatalog.features.find(f=>f.id===v.id);if(!f)return '';
 const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 const pts=polys.flat(2),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
 const scale=Math.min(124/((maxx-minx)*.835),130/(maxy-miny)),cx=(minx+maxx)/2,cy=(miny+maxy)/2;
 const xy=p=>[78+(p[0]-cx)*.835*scale,75-(p[1]-cy)*scale];
 const paths=polys.map(rs=>rs.map(r=>r.filter((_,i)=>i%Math.max(1,Math.floor(r.length/150))===0).map((p,i)=>`${i?'L':'M'}${xy(p).map(n=>n.toFixed(1)).join(',')}`).join(' ')+'Z').join(' ')).join(' ');
 return `<svg viewBox="0 0 310 150" aria-hidden="true"><defs><pattern id="grid-${v.id}" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#dce5d5" stroke-width=".5"/></pattern></defs><rect width="310" height="150" fill="#f1f5eb"/><rect width="310" height="150" fill="url(#grid-${v.id})"/><path d="${paths}" fill="#d9e5cc" fill-rule="evenodd" stroke="#678463" stroke-width="1.7"/>${v.places.filter(p=>p.coordinates&&p.withinBoundary).map(p=>{const q=xy(p.coordinates);return `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.5" fill="${guideCategories[p.category].color}" stroke="#fff"/>`;}).join('')}<text x="171" y="45" font-size="8" letter-spacing="1.7" fill="#7c9073">VILLAGE ATLAS</text><text x="170" y="74" font-size="24" font-weight="600" fill="#36583f">${esc(v.name)}</text><text x="171" y="99" font-size="9" fill="#73856b">물 · 땅 · 마을의 이야기</text><text x="171" y="119" font-size="8" fill="#8b9b81">법정구역과 확인된 장소</text></svg>`;
}
function renderOriginalGuideRoutes(v,routes){
 return `<section class="original-route-section"><h3>원본 안내도에 담긴 길 <small>${v.routes.length}</small></h3><p>길 이름을 기준으로 GPS 자료를 연결했어요. 지도에 표시할 근거가 없는 길은 원본 그림에서 확인할 수 있어요.</p>${v.routes.map((r,i)=>{
  const matches=routes.filter(f=>(f.properties.originalGuideRoutes||[]).includes(r.name));
  return `<article class="original-route-card"><div><i style="background:${r.color}"></i><strong>${esc(r.name)}</strong>${r.lengthKm?`<small>안내도 ${r.lengthKm} km</small>`:''}</div><p>${esc(r.summary)}</p>${matches.length?matches.map(f=>`<button class="original-route-action" data-walking-route="${f.id}">GPS 구간 지도에 표시 · ${num(f.properties.displayGeometryKm,2)} km ↗</button>`).join(''):`<span class="route-missing">공개 GPS 자료 미확보</span><button class="original-route-action secondary" data-original-route="${i}">그림지도에서 길 살펴보기 ↗</button>`}</article>`;
 }).join('')}</section>`;
}
function renderVillageGuide(){
 if(!villageGuideCatalog)return;
 const all=state.village==='all',places=scopedGuidePlaces(),filtered=guideFilteredPlaces(),located=places.filter(p=>p.coordinates).length,routes=scopedWalkingRoutes();
 if(all){
  $('#guide-content').innerHTML=`<div class="guide-intro"><span class="eyebrow">FOUR VILLAGES, ONE ATLAS</span><h2>네 마을을 더 가까이</h2><p>안내도에 실린 88개 장소를 모두 다시 조사했어요. 위치마다 출처 좌표·주소·구역·후보를 구분하고, 길은 안내도에 나온 지역 구간을 중심으로 보여줘요.</p></div>${positionSummary(places)}<div class="guide-overview-grid">${villageGuideCatalog.villages.map(v=>`<button data-guide-village="${v.id}" class="atlas-village-card">${villageGuideGraphic(v)}<span><b>${v.places.length}개 장소</b><small>지도 연결 ${v.places.filter(p=>p.coordinates).length} · 사진 ${v.places.filter(p=>p.photo).length}</small><i>마을 탐색 ↗</i></span></button>`).join('')}</div><button class="atlas-all-routes" id="all-gps-routes">지역 구간 GPS ${routes.filter(f=>f.properties.kind==='guide').length}개 · 연계 답사 ${routes.filter(f=>f.properties.kind==='related').length}개 ↗</button><div id="all-route-list"></div>`;
  $$('[data-guide-village]').forEach(b=>b.onclick=()=>selectVillage(b.dataset.guideVillage));
  $('#all-gps-routes').onclick=()=>{$('#all-route-list').innerHTML=renderWalkingCards(routes);wireWalkingCards();};return;
 }
 const v=guideFor(state.village),photos=places.filter(p=>p.photo).length,guideRoutes=routes.filter(f=>f.properties.kind==='guide'),relatedRoutes=routes.filter(f=>f.properties.kind==='related');
 const routeView=`<section class="gps-course-section"><h3>안내도 속 지역을 걷는 길</h3><p>선택하면 해당 지역의 GPS 구간만 나타나요. ‘내 위치’를 켜면 기기의 현재 위치를 함께 볼 수 있어요.</p>${guideRoutes.length?renderWalkingCards(guideRoutes):'<div class="local-route-empty">원본 마을길의 공개 GPS 자료를 아직 확보하지 못했어요. 아래에서 원본 길의 이름과 그림을 살펴볼 수 있어요.</div>'}</section>${renderOriginalGuideRoutes(v,guideRoutes)}${relatedRoutes.length?`<section class="related-route-section"><h3>함께 살펴볼 답사 기록</h3><p>원본 안내도 길과의 동일성이 확인되지 않은 별도 기록입니다.</p>${renderWalkingCards(relatedRoutes)}</section>`:''}`;
 $('#guide-content').innerHTML=`<div class="guide-intro"><span class="eyebrow">${esc(v.id.toUpperCase())} · VILLAGE ATLAS</span><h2>${esc(v.name)}, 길과 이야기</h2><p>${esc(v.intro)}</p></div><button class="guide-atlas-banner" id="guide-boundary-fit" aria-label="${esc(v.name)} 마을 전체 지도 보기">${villageGuideGraphic(v)}<span>마을 전체 보기 ↗</span></button><div class="atlas-guide-stats"><span><b>${places.length}</b>장소·이야기</span><span><b>${located}</b>지도 연결</span><span><b>${photos}</b>사진</span></div>${positionSummary(places)}<div class="atlas-mode-switch" role="group" aria-label="마을 안내 보기"><button data-guide-mode="places" aria-pressed="${guideUI.mode==='places'}" class="${guideUI.mode==='places'?'active':''}">장소 둘러보기</button><button data-guide-mode="routes" aria-pressed="${guideUI.mode==='routes'}" class="${guideUI.mode==='routes'?'active':''}">안내도 탐방길 <b>${v.routes.length}</b></button></div>${guideUI.mode==='routes'?routeView:`<p class="guide-scope-note">채운 핀은 출처 좌표, 테두리 핀은 주소·구역·접근점, 마름모는 위치 후보예요. 위치의 성격과 근거는 장소를 눌러 확인하세요.</p><label class="position-filter-label" for="guide-position-filter">위치 근거로 보기<select id="guide-position-filter"><option value="all">전체 ${places.length}곳</option>${Object.entries(positionLabels).map(([key,label])=>`<option value="${key}" ${guideUI.position===key?'selected':''}>${label} ${places.filter(p=>p.reviewStatus===key).length}곳</option>`).join('')}</select></label><div class="guide-categories"><button data-guide-category="all" class="${guideUI.category==='all'?'active':''}">전체</button>${Object.entries(guideCategories).filter(([key])=>places.some(p=>p.category===key)).map(([key,c])=>`<button data-guide-category="${key}" class="${guideUI.category===key?'active':''}">${c.symbol} ${c.label}</button>`).join('')}</div><div class="guide-place-list">${filtered.map(guidePlaceCard).join('')||'<p class="empty-message">이 조건에 해당하는 장소가 없습니다.</p>'}</div>`}<button class="original-guide-link" id="guide-cover">원본 그림지도 참고하기 <span>${v.images.length}쪽 · 확대·장소 선택 ↗</span></button><details class="guide-source-note"><summary>전수 조사·사진·위치 자료 기준</summary><p>원본: ${esc(v.sourceFile)}${v.sourceDate?' · '+esc(v.sourceDate):''}. 네 마을 88개 항목을 모두 조사했으며 좌표를 확보한 경우와 미확보인 경우를 구분합니다. 전수 조사는 현장 GPS 실측이나 모든 위치의 확정을 뜻하지 않습니다.</p><p>주소 대표점·접근 기준점은 명소 자체의 정밀 좌표와 다릅니다. 위치 후보는 원본의 장소와 동일한지 추가 확인이 필요합니다. 옛 지명·폐업 시설·동명이 있는 장소는 확인 근거와 남은 문제를 개별 카드에 기록했습니다.</p><p>확인일 ${esc(villageGuideCatalog.checkedAt)} · GeoNames CC BY 4.0 · © OpenStreetMap contributors, ODbL. 사진은 촬영일 미상 자료사진이며 장소별 출처를 표시합니다.</p></details>`;
 $('#guide-cover').onclick=()=>openIllustration(v.id);$('#guide-boundary-fit').onclick=()=>fitVillageBoundary(v.id);
 $$('[data-guide-mode]').forEach(b=>b.onclick=()=>{guideUI.mode=b.dataset.guideMode;renderVillageGuide();});
 if($('#guide-position-filter'))$('#guide-position-filter').onchange=e=>{guideUI.position=e.target.value;renderVillageGuide();renderGuideMap();};
 $$('[data-guide-category]',$('#guide-content')).forEach(b=>b.onclick=()=>{guideUI.category=b.dataset.guideCategory;renderVillageGuide();renderGuideMap();});
 $$('[data-guide-place]',$('#guide-content')).forEach(b=>b.onclick=()=>selectGuidePlace(b.dataset.guidePlace,{focus:true,popup:true}));
 $$('[data-original-route]',$('#guide-content')).forEach(b=>b.onclick=()=>{openIllustration(v.id);$('#illustration-source').textContent=`${v.routes[+b.dataset.originalRoute].name} · 원본 그림의 길입니다. 실제 GPS 좌표 경로는 확보하지 못했습니다.`;});
 wireWalkingCards();
}
function guidePlaceCard(p){
 const cat=guideCategories[p.category]||guideCategories.nature;
 return `<button class="guide-place-card ${guideUI.selected===p.id?'selected':''}" data-guide-place="${esc(p.id)}"><span class="atlas-place-thumb" style="--place-color:${cat.color}">${p.photo?`<img src="${esc(p.photo.url)}" alt="" loading="lazy" width="76" height="70">`:`<i>${cat.symbol}</i>`}<b>${esc(guideNumber(p))}</b></span><span class="guide-card-text"><strong>${esc(p.name)}</strong><small>${esc(p.summary)}</small><em class="position-text-${p.reviewStatus}">${esc(guideLocationLabel(p))} ↗</em></span></button>`;
}
function guidePlaceCopy(p){
 return `<span class="eyebrow">${esc(p.villageName)} · ${guideCategories[p.category]?.label||'마을 안내'}</span><h2>${esc(p.name)}</h2>${guidePhoto(p)}<p class="guide-place-summary">${esc(p.summary)}</p>${(p.details||[]).map(t=>`<p class="guide-place-summary">${esc(t)}</p>`).join('')}${p.address?`<p class="place-address">${esc(p.address)}<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address+' '+p.name)}" target="_blank" rel="noopener">웹 지도에서 찾기 ↗</a></p>`:''}<div class="guide-location-status position-${p.reviewStatus} ${p.coordinates?'located':''}">${p.coordinates?'●':'◌'} ${esc(guideLocationLabel(p))}</div><p class="guide-location-note">${esc(p.locationNote||'실제 지도에 표시할 정확한 위치는 확인하지 못했습니다. 원본 안내도의 배치로 살펴보세요.')}</p>${p.withinBoundary===false?'<p class="guide-outside-note">법정 마을 경계 밖의 연계 장소입니다. 원본 마을 안내도에 수록되어 함께 소개합니다.</p>':''}`;
}
function selectGuidePlace(id,{focus=false,popup=false,illustrated=false}={}){
 const p=guidePlaceIndex.get(id);if(!p)return;
 guideUI.selected=id;state.selected=null;map.closePopup();if(highlight){map.removeLayer(highlight);highlight=null;}
 updateGuideSelection();
 $('#detail-content').innerHTML=`<div class="guide-place-detail">${guidePlaceCopy(p)}<div class="detail-actions">${p.coordinates?`<button id="guide-focus-place">${icon('fit')}실제 지도에서 보기</button>`:''}<button id="guide-open-source">그림지도에서 보기 ↗</button></div><div class="terrain-sources"><h4>자료와 위치 확인 출처</h4><p>${esc(guideFor(p.villageId).sourceFile)}</p>${guideLinks(p)}<p>조사 확인 ${esc(p.checkedAt)} · ${esc(positionLabels[p.reviewStatus])}</p></div>${p.coordinates?`<p class="source-reference">대표 위치 · ${p.coordinates[1].toFixed(6)}° N, ${p.coordinates[0].toFixed(6)}° E<br>지점의 위치이며 시설·숲·길의 전체 경계를 뜻하지 않습니다.</p>`:''}</div>`;
 $('#guide-open-source').onclick=()=>openIllustration(p.villageId,p.id);
 if($('#guide-focus-place'))$('#guide-focus-place').onclick=()=>selectGuidePlace(id,{focus:true,popup:true});
 setPanel('detail');$('#selection-dot').hidden=false;$('#detail-content').scrollTop=0;
 if(p.coordinates){
  if(!guideUI.places){guideUI.places=true;renderGuideControls();renderGuideMap();renderLegend();}
  updateGuideSelection();
  const ll=[p.coordinates[1],p.coordinates[0]];
  highlight=L.circleMarker(ll,{pane:'selectionPane',interactive:false,radius:20,color:'#2e5c48',weight:2,fillOpacity:.08}).addTo(map);
  if(focus)map.setView(ll,['area','candidate'].includes(p.reviewStatus)?14.5:15.5,{animate:false});
  if(popup){
   const same=scopedGuidePlaces().filter(q=>q.id!==p.id&&q.coordinates&&Math.abs(q.coordinates[0]-p.coordinates[0])<1e-7&&Math.abs(q.coordinates[1]-p.coordinates[1])<1e-7);
   const offset=guideMarkerIndex.get(id)?.guideOffset||L.point(0,0),anchor=map.unproject(map.project(L.latLng(ll),map.getZoom()).add(offset),map.getZoom());
   const maxWidth=Math.max(160,Math.min(280,map.getSize().x-76));
   const popupBox=L.popup({className:'guide-place-popup',maxWidth,minWidth:Math.min(200,maxWidth),maxHeight:Math.min(290,Math.max(160,map.getSize().y-160)),autoPan:false,offset:[0,-18]}).setLatLng(anchor).setContent(`<span class="guide-popup-number">${esc(p.villageName)} · ${esc(guideNumber(p))}번</span><strong>${esc(p.name)}</strong><small>${esc(guideLocationLabel(p))}</small>${p.photo?`<img class="guide-popup-photo" src="${esc(p.photo.url)}" alt="${esc(p.photo.alt)}"><small>${esc(p.photo.credit)} · 자료사진</small>`:''}<p>${esc(p.summary)}</p><button class="guide-popup-details" data-guide-details>사진·설명·출처 자세히 보기 ↗</button>${same.length?`<div class="same-location"><small>같은 기준 위치의 다른 항목</small>${same.map(q=>`<button data-same-place="${q.id}">${esc(guideNumber(q))}번 · ${esc(q.name)} ↗</button>`).join('')}</div>`:''}`).openOn(map);
   revealGuidePopup(popupBox);
   $('[data-guide-details]',popupBox.getElement()).onclick=()=>{setPanel('detail');$('#detail-content').scrollTop=0;$('.analysis-panel').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
   $$('[data-same-place]',popupBox.getElement()).forEach(b=>b.onclick=()=>selectGuidePlace(b.dataset.samePlace,{popup:true}));
  }
 }
 $('#search-results').hidden=true;
}
function openIllustration(villageId,placeId=null){
 if(!villageId||villageId==='all')villageId=state.village==='all'?'harye':state.village;
 illustrationVillage=villageId;illustrationSelected=placeId;
 const p=placeId?guidePlaceIndex.get(placeId):null;illustrationPage=p?.hotspot?.page||1;
 const dialog=$('#illustration-dialog');if(!dialog.open)dialog.showModal();
 renderIllustration();
 requestAnimationFrame(()=>{illustrationMap.invalidateSize();fitIllustration();if(p)focusIllustrationPlace(p);});
}
function renderIllustration(){
 const v=guideFor(illustrationVillage),page=v.images.find(i=>i.page===illustrationPage)||v.images[0];
 illustrationPage=page.page;
 $('#illustration-title').textContent=`${v.name} 생태관광 그림지도`;
 $('#illustration-villages').innerHTML=villageGuideCatalog.villages.map(x=>`<button data-illustration-village="${x.id}" class="${x.id===v.id?'active':''}">${esc(x.name)}</button>`).join('');
 $('#illustration-pages').innerHTML=v.images.length>1?v.images.map(x=>`<button data-illustration-page="${x.page}" class="${x.page===illustrationPage?'active':''}">${esc(x.label||x.page+'쪽')}</button>`).join(''):'';
 $$('[data-illustration-village]').forEach(b=>b.onclick=()=>{illustrationVillage=b.dataset.illustrationVillage;illustrationPage=1;illustrationSelected=null;renderIllustration();fitIllustration();});
 $$('[data-illustration-page]').forEach(b=>b.onclick=()=>{illustrationPage=+b.dataset.illustrationPage;illustrationSelected=null;renderIllustration();fitIllustration();});
 if(!illustrationMap)illustrationMap=L.map('illustration-map',{crs:L.CRS.Simple,attributionControl:false,minZoom:-4,maxZoom:2,zoomSnap:.1,scrollWheelZoom:true,keyboard:true});
 if(illustrationOverlay)illustrationMap.removeLayer(illustrationOverlay);
 if(illustrationMarkers)illustrationMap.removeLayer(illustrationMarkers);
 const bounds=[[0,0],[page.height,page.width]];
 illustrationOverlay=L.imageOverlay(page.url,bounds,{alt:v.title,interactive:false}).addTo(illustrationMap);
 illustrationMap.setMaxBounds(L.latLngBounds(bounds).pad(.35));
 const ps=v.places.filter(p=>p.hotspot&&(p.hotspot.page||1)===illustrationPage);
 illustrationMarkers=L.layerGroup(ps.map(p=>L.marker([page.height*(1-p.hotspot.y),page.width*p.hotspot.x],{title:p.name,keyboard:true,icon:L.divIcon({className:'illustration-hotspot',html:`<span class="${illustrationSelected===p.id?'active':''}">${esc(guideNumber(p))}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).bindTooltip(esc(p.name),{direction:'top',offset:[0,-16]}).on('click',()=>{illustrationSelected=p.id;renderIllustrationDetail(p);}))).addTo(illustrationMap);
 $('#illustration-source').textContent=`원본: ${v.sourceFile}${v.sourceDate?' · '+v.sourceDate:''} · 안내용 그림의 배치를 유지했습니다. 실제 GPS 경로·행정경계와 다릅니다.`;
 renderIllustrationDetail(illustrationSelected?guidePlaceIndex.get(illustrationSelected):null);
}
function fitIllustration(){if(illustrationMap&&illustrationOverlay)illustrationMap.fitBounds(illustrationOverlay.getBounds(),{padding:[22,22],animate:false});}
function focusIllustrationPlace(p){
 const v=guideFor(illustrationVillage),page=v.images.find(x=>x.page===(p.hotspot?.page||1));
 if(!page||!p.hotspot)return;
 const ll=[page.height*(1-p.hotspot.y),page.width*p.hotspot.x];
 illustrationMap.setView(ll,Math.max(illustrationMap.getZoom(),-.15),{animate:false});
 renderIllustrationDetail(p);
}
function renderIllustrationDetail(p){
 const v=guideFor(illustrationVillage);
 $('#illustration-detail').innerHTML=p?`<div class="illustration-selected-copy">${guidePlaceCopy(p)}<div class="detail-actions">${p.coordinates?'<button id="illustration-go-real">실제 지도에서 보기 ↗</button>':''}<button id="illustration-show-all">다른 장소 보기</button></div><div class="terrain-sources"><h4>자료 출처</h4><p>${esc(v.sourceFile)}</p>${guideLinks(p)}</div></div>`:`<div class="illustration-list-intro"><span class="eyebrow">SELECT A PLACE</span><h3>지도 속 이야기를 눌러보세요</h3><p>번호를 누르거나 아래 목록에서 골라보세요. 그림은 자유롭게 확대할 수 있어요.</p></div><div class="illustration-place-list">${v.places.filter(p=>(p.hotspot?.page||1)===illustrationPage).map(guidePlaceCard).join('')}</div>`;
 $('#illustration-detail').scrollTop=0;
 if(illustrationMarkers)illustrationMarkers.eachLayer(marker=>{const el=marker.getElement();if(!el)return;const active=!!p&&marker.options.title===p.name;el.querySelector('span').classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
 if(p){
  if($('#illustration-go-real'))$('#illustration-go-real').onclick=async()=>{const id=p.id;$('#illustration-dialog').close();if(state.village!==p.villageId&&state.village!=='all')await selectVillage(p.villageId);selectGuidePlace(id,{focus:true,popup:true,illustrated:true});};
  $('#illustration-show-all').onclick=()=>{illustrationSelected=null;renderIllustrationDetail(null);};
 }else $$('[data-guide-place]',$('#illustration-detail')).forEach(b=>b.onclick=()=>{const p=guidePlaceIndex.get(b.dataset.guidePlace);illustrationSelected=p.id;focusIllustrationPlace(p);});
}
function wireVillageGuides(){
 wireWalkingMap();
 $('#guide-tab').onclick=()=>{renderVillageGuide();setPanel('guide');};
 $('#open-illustration-map').onclick=()=>openIllustration(state.village);
 $('#illustration-fit').onclick=fitIllustration;
 $('#illustration-dialog').addEventListener('close',()=>{$('#open-illustration-map').focus();});
 const button=document.createElement('button');button.className='export-option';
 button.innerHTML=`<span>${icon('globe')}</span><span><strong>마을 안내도 장소 CSV</strong><small>선택 마을의 명소·설명·확인 좌표·출처</small></span><span>↓</span>`;
 $('[data-export="geojson"]').before(button);
 button.onclick=()=>{const rows=[['마을','안내번호','이름','분류','설명','경도','위도','위치성격','주소','위치근거','조사구분','조사검색어','조사확인일','법정경계내','그림지도쪽','자료출처','사진출처']];for(const p of scopedGuidePlaces())rows.push([p.villageName,p.number,p.name,guideCategories[p.category]?.label,p.summary,p.coordinates?.[0]??'',p.coordinates?.[1]??'',guideLocationLabel(p),p.address||'',p.locationNote,positionLabels[p.reviewStatus],(p.reviewTerms||[]).join(' | '),p.checkedAt,p.withinBoundary==null?'미확인':p.withinBoundary?'예':'주변 연계 장소',p.hotspot?.page||1,(p.sources||[]).map(s=>s.url).join(' | '),p.photo?.credit||'']);download(`제주_${state.village==='all'?'네마을':village().name}_안내도_장소.csv`,csv(rows),'text/csv;charset=utf-8');$('#export-dialog').close();toast('마을 안내도 장소 목록을 내보냈습니다.');};
}
