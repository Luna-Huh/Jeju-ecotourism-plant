'use strict';
function renderWalkingCards(routes){
 return `<div class="gps-course-list">${routes.map(f=>{const r=f.properties,active=f.id===guideUI.routeId;return `<article class="gps-course-card ${active?'active':''}" style="--route-color:${r.color}"><button class="gps-course-select" data-walking-route="${f.id}" aria-pressed="${active}"><span class="gps-course-number">${esc(r.number)}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.summary)}</small><em>${esc(r.scopeLabel)} · 표시 구간 ${num(r.displayGeometryKm,2)} km${r.recordedAt?' · '+esc(r.recordedAt)+' 기록':''}</em></span><b>${active?'●':'↗'}</b></button><details><summary>경로 근거와 구간 범위</summary><p>${esc(r.geometryNote)}</p><p>지도에 표시하는 선의 측정 거리 ${num(r.displayGeometryKm,2)} km${r.guideAdvertisedKm?' · 원본 안내도 '+r.guideAdvertisedKm+' km':''}<br>자료 확인 ${esc(r.retrievedAt)}</p><a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.sourceTitle)} ↗</a>${r.officialUrl?`<a href="${esc(r.officialUrl)}" target="_blank" rel="noopener">공식 장소·코스 안내 ↗</a>`:''}${r.license?`<p>${esc(r.license)}</p>`:''}</details></article>`;}).join('')}</div>`;
}
function wireWalkingCards(){
 $$('[data-walking-route]').forEach(b=>b.onclick=()=>selectWalkingRoute(b.dataset.walkingRoute));
}
function selectWalkingRoute(id){
 const f=walkingRouteCatalog.features.find(f=>f.id===id);if(!f)return;
 guideUI.routeId=id;map.closePopup();renderWalkingRoute();renderLegend();renderVillageGuide();
 map.fitBounds(L.geoJSON(f).getBounds(),{padding:[42,74],maxZoom:15,animate:false});
 $('#gps-route-status').textContent=`${f.properties.name}, ${f.properties.scopeLabel} ${num(f.properties.displayGeometryKm,2)}km를 표시했습니다.`;
}
function clearWalkingRoute(){
 guideUI.routeId=null;renderWalkingRoute();renderLegend();renderVillageGuide();$('#gps-route-status').textContent='선택한 코스를 숨겼습니다.';
}
function renderWalkingRoute(){
 if(!map)return;
 if(walkingRouteDisplay){map.removeLayer(walkingRouteDisplay);walkingRouteDisplay=null;}
 const f=currentWalkingRoute(),chip=$('#active-route-chip');
 if(!f){chip.hidden=true;return;}
 const r=f.properties,lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates,ll=p=>[p[1],p[0]];
 const halo=L.geoJSON(f,{pane:'walkingRoutePane',interactive:false,style:{pane:'walkingRoutePane',color:'#fff',weight:8,opacity:.98}});
 const line=L.geoJSON(f,{pane:'walkingRoutePane',style:{pane:'walkingRoutePane',color:r.color,weight:4.5,opacity:1,lineCap:'round',lineJoin:'round',dashArray:r.kind==='related'?'7 5':undefined}}).bindTooltip(`${esc(r.name)} · ${esc(r.scopeLabel)}`,{sticky:true});
 const endpoints=lines.flatMap((cs,i)=>[cs[0],cs.at(-1)].map((pt,j)=>L.marker(ll(pt),{pane:'walkingRoutePane',title:`${r.name} 표시 구간 ${i+1}의 ${j?'끝':'시작'}`,icon:L.divIcon({className:'route-endpoint '+(j?'route-finish':''),html:`<span>구간 ${j?'끝':'시작'}</span>`,iconSize:[46,24],iconAnchor:[23,12]})}).bindPopup(`<strong>${esc(r.name)}</strong><p>${esc(r.scopeLabel)}의 표시 끝점입니다. 전체 코스의 공식 출발·도착 안내가 아닙니다.</p>`)));
 walkingRouteDisplay=L.layerGroup([halo,line,...endpoints]).addTo(map);
 chip.hidden=false;chip.innerHTML=`<i style="background:${r.color}"></i><button id="refit-route"><strong>${esc(r.name)}</strong><small>${esc(r.scopeLabel)} · ${num(r.displayGeometryKm,2)} km</small></button><button id="clear-route" aria-label="선택한 코스 숨기기">×</button>`;
 $('#refit-route').onclick=()=>map.fitBounds(line.getBounds(),{padding:[42,74],maxZoom:15,animate:false});$('#clear-route').onclick=clearWalkingRoute;
}
function liveLocationStatus(message){$('#gps-route-status').textContent=message;$('#location-button').title=message;}
function stopLiveLocation(){
 if(locationWatch!==null)navigator.geolocation?.clearWatch(locationWatch);locationWatch=null;
 if(liveLocationDisplay){map.removeLayer(liveLocationDisplay);liveLocationDisplay=null;}
 lastLocation=null;const b=$('#location-button');b.classList.remove('active');b.setAttribute('aria-pressed','false');b.innerHTML='<span>◎</span> 내 위치';liveLocationStatus('현재 위치 표시를 종료했습니다.');
}
function toggleLiveLocation(){
 if(locationWatch!==null){stopLiveLocation();return;}
 if(!navigator.geolocation){toast('이 브라우저에서 현재 위치 기능을 사용할 수 없습니다.');return;}
 const b=$('#location-button');b.classList.add('active');b.setAttribute('aria-pressed','true');b.innerHTML='<span>◎</span> 위치 찾는 중';liveLocationStatus('기기의 위치 권한을 확인하고 있습니다.');
 let first=true;
 locationWatch=navigator.geolocation.watchPosition(pos=>{
  const {latitude,longitude,accuracy}=pos.coords;
  if(liveLocationDisplay)map.removeLayer(liveLocationDisplay);
  const ll=[latitude,longitude];lastLocation={latitude,longitude,accuracy};
  const circle=L.circle(ll,{pane:'liveLocationPane',radius:accuracy,color:'#3f7ed0',weight:1,fillColor:'#81b0ec',fillOpacity:.13,interactive:false});
  const marker=L.circleMarker(ll,{pane:'liveLocationPane',radius:7,color:'#fff',weight:3,fillColor:'#357bd0',fillOpacity:1}).bindTooltip(`내 위치 · 기기 정확도 약 ${Math.round(accuracy)}m`);
  liveLocationDisplay=L.layerGroup([circle,marker]).addTo(map);
  b.innerHTML='<span>●</span> 위치 표시 중';liveLocationStatus(`현재 위치를 표시했습니다. 기기 정확도 약 ${Math.round(accuracy)}m. 위치는 서버로 전송·저장하지 않습니다.`);
  if(first){map.setView(ll,15,{animate:false});first=false;}
 },err=>{
  const message=err.code===1?'위치 권한이 허용되지 않았어요. 브라우저 설정에서 위치 권한을 켜면 사용할 수 있어요.':err.code===2?'기기에서 현재 위치를 확인하지 못했어요.':'위치를 찾는 시간이 초과됐어요. 다시 눌러주세요.';
  stopLiveLocation();liveLocationStatus(message);toast(message);
 },{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
}
function wireWalkingMap(){
 $('#location-button').onclick=toggleLiveLocation;
 window.addEventListener('pagehide',()=>{if(locationWatch!==null)navigator.geolocation?.clearWatch(locationWatch);});
}
