(async () => {
  const root = document.querySelector('#tour'), token = root.dataset.token;
  let response,p;try{response=await fetch('./tour.json',{cache:'no-store'});p=await response.json()}catch(e){root.textContent='Не удалось загрузить данные тура. Проверьте работу локального сервера и обновите страницу.';return}
  if (!response.ok) {
    root.innerHTML='<main class="main"><h1>Тур не открыт</h1><p id="tour-error"></p><a href="./">Обновить страницу</a></main>';root.querySelector('#tour-error').textContent=p.error||'Задание не найдено или результат устарел.';
    return;
  }
  if(!Array.isArray(p.scenes)||!p.scenes.length){root.textContent='В этом задании нет готовых панорам.';return}
  let current = p.scenes.some(s=>s.id===p.initialSceneId)?p.initialSceneId:p.scenes[0].id;
  const floors = Array.isArray(p.floors)&&p.floors.length ? p.floors : (p.floorplan?[{id:'legacy',name:p.floorLabel||'1',image:p.floorplan}]:[]);
  let mapFloor=floors[0]?.id;
  function transitionText(h){if(!h.actionText)return null;const target=p.scenes.find(s=>s.id===h.targetSceneId),f=floors.find(f=>f.id===target?.floorId);if(h.actionText.startsWith('Подняться:')&&/мансард/i.test(f?.name||''))return 'Подняться на мансарду';if(h.actionText.startsWith('Спуститься:')&&f?.id===floors[0]?.id)return 'Спуститься на первый этаж';return h.actionText}
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  root.innerHTML = `<header class="top"><div class="brand">ILYA <span>WALK</span></div><strong>${E(p.title)}</strong></header><div class="tour"><aside class="touraside"><div class="eyebrow">Панорамный тур</div><h2>Помещения</h2><div id="scene-list"></div><p class="hint">Поверните вид мышью или пальцем. Нажмите на стрелку для перехода.</p></aside><div class="stage"><div class="pano" id="pano"></div><div class="map-panel"><button id="toggle-map" aria-expanded="true">План</button><div id="map"></div></div><div class="floater"><div class="badge"></div><button id="full">⛶ На весь экран</button></div></div></div>`;
  const styles = Array.isArray(p.styles) ? p.styles.filter(x=>x && typeof x.id==='string' && typeof x.label==='string') : [];
  const styleReady=id=>p.scenes.every(x=>!!x.styleImages?.[id]);
  let style = styles.find(x=>styleReady(x.id))?.id || null, viewer = null;
  if(styles.length){
    const panel=document.createElement('section');
    panel.className='style-selector'; panel.innerHTML='<h3>Стиль интерьера</h3><div></div><p class="style-status" role="status" aria-live="polite"></p>';
    root.querySelector('.touraside').prepend(panel);
  }
  const qualityVariants=Array.isArray(p.qualityVariants)?p.qualityVariants:[];
  let quality=qualityVariants.find(x=>x.default)?.id||qualityVariants[0]?.id;
  if(qualityVariants.length){const panel=document.createElement('section');panel.id='quality-comparison';panel.innerHTML='<h3>Сравнение качества</h3><label>Один ракурс<select id="quality-variant">'+qualityVariants.map(v=>'<option value="'+E(v.id)+'" '+(v.id===quality?'selected':'')+'>'+E(v.label)+'</option>').join('')+'</select></label><p>Warm Final test. Свет и камера одинаковые. Переключение сохраняет направление взгляда.</p>';root.querySelector('.touraside').prepend(panel)}
  const scenes = {};
  for (const s of p.scenes) {
    scenes[s.id] = {type:'equirectangular', panorama:s.image, hfov:100,
      hotSpots:(s.hotspots || []).filter(h => p.scenes.some(x => x.id === h.targetSceneId)).map(h => ({
        pitch:h.actionText?.startsWith('Подняться:')?8:h.actionText?.startsWith('Спуститься:')?-38:h.pitch, yaw:h.yaw, cssClass:'walk-arrow', type:'scene', sceneId:h.targetSceneId,
        targetYaw:Number.isFinite(h.targetYaw) ? h.targetYaw : 'same',
        targetPitch:Number.isFinite(h.targetPitch) ? h.targetPitch : 0,
        text:transitionText(h) || p.scenes.find(x => x.id === h.targetSceneId).name,
        createTooltipFunc:(div, name) => {
          div.dataset.targetScene=h.targetSceneId; div.setAttribute('role','button'); div.setAttribute('tabindex','0');
          div.setAttribute('aria-label','Перейти: '+name);
          const label=document.createElement('span'); label.className='walk-arrow-label'; label.textContent=name; div.appendChild(label);
          div.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();div.click()} });
        }, createTooltipArgs:transitionText(h) || p.scenes.find(x => x.id === h.targetSceneId).name
      }))};
  }
  function launch(view) {
    viewer?.destroy();
    if(styles.length && !style){viewer=null;root.querySelector('#pano').innerHTML='<div class="empty">Комплект панорам для стиля пока не готов.</div>';return}
    for(const s of p.scenes) {
      const variant=s.styleImages?.[style];
      const qualityImage=s.qualityImages?.[quality]||(variant&&typeof variant==='object'?variant:null);
      if(qualityImage?.multiRes){scenes[s.id].type='multires';scenes[s.id].multiRes=qualityImage.multiRes;delete scenes[s.id].panorama}
      else{scenes[s.id].type='equirectangular';scenes[s.id].panorama=qualityImage?.image||(typeof variant==='string'?variant:null)||s.image;delete scenes[s.id].multiRes}
      if(qualityVariants.length){scenes[s.id].minHfov=50;scenes[s.id].maxHfov=120}

    }
    if(!current)return;
    scenes[current].yaw=view?.yaw ?? 0; scenes[current].pitch=view?.pitch ?? 0; scenes[current].hfov=view?.hfov ?? 100;
    viewer=pannellum.viewer('pano',{default:{firstScene:current,autoLoad:true,sceneFadeDuration:500},scenes});
    viewer.on('scenechange', id=>{current=id;update()});
    viewer.on('load',()=>{const status=root.querySelector('.style-status');if(status)status.textContent=p.scenes.find(s=>s.id===current)?.styleImages?.[style] ? '' : 'Для этой точки выбранный стиль пока недоступен; показана исходная панорама.'});
  }
  function update() {
    const s=p.scenes.find(x=>x.id===current);
    const status=root.querySelector('.style-status');
    if(status)status.textContent=s?.styleImages?.[style] ? '' : 'Для этой точки выбранный стиль пока недоступен; показана исходная панорама.';
    root.querySelector('.badge').textContent=s?.name||'Тур';
    root.querySelector('#scene-list').innerHTML=p.scenes.map(x=>`<button class="${x.id===current?'':'secondary'}" data-id="${E(x.id)}">${E(x.name)}</button>`).join('');
    const styleButtons=root.querySelector('.style-selector > div');
    if(styleButtons)styleButtons.innerHTML=styles.map(x=>`<button type="button" class="${x.id===style?'':'secondary'}" data-style="${E(x.id)}" ${styleReady(x.id)?'':'disabled'}>${E(x.label)}${styleReady(x.id)?'':' — комплект не готов'}</button>`).join('');
    mapFloor=s?.floorId||floors[0]?.id; renderMap();
    let stairs=root.querySelector('#stairs-actions');if(!stairs){stairs=document.createElement('section');stairs.id='stairs-actions';root.querySelector('.touraside').append(stairs)}stairs.replaceChildren();for(const h of s?.hotspots||[]){if(!h.actionText)continue;const button=document.createElement('button');button.dataset.id=h.targetSceneId;button.textContent=transitionText(h);button.style.display='block';button.style.margin='12px 0';stairs.append(button)}
  }
  function renderMap(){
    if(floors.length){
      const map=root.querySelector('#map'),f=floors.find(x=>x.id===mapFloor);
      map.innerHTML=`<label>Этаж<select id="viewer-floor">${floors.map(x=>`<option value="${E(x.id)}" ${x.id===mapFloor?'selected':''}>${E(x.name)}</option>`).join('')}</select></label>${p.planIsTechnical?'<small class="plan-note">Техническое сечение — тест</small>':''}${f?.image?`<div class="plan"><img src="${E(f.image)}" alt="План этажа"><div id="pins"></div></div>`:'<p class="hint">План этажа пока не загружен</p>'}`;
      if(!f?.image)return;
      map.querySelector('img').addEventListener('error',()=>{const plan=map.querySelector('.plan');if(plan)plan.outerHTML='<p class="hint">План этажа пока не загружен</p>'});
      for(const x of p.scenes.filter(x=>x.mapX!=null&&x.mapY!=null&&(x.floorId||floors[0]?.id)===mapFloor)){
        const b=document.createElement('button');b.className='pin '+(x.id===current?'active':''); b.title=x.name;b.setAttribute('aria-label',x.name);b.style.left=x.mapX+'%';b.style.top=x.mapY+'%';b.dataset.id=x.id;if(x.id===current){const heading=document.createElement('span');heading.className='map-heading';b.appendChild(heading)}map.querySelector('#pins').append(b);
      }
    }
  }
  root.addEventListener('click',e=>{
    const target=e.target.closest('[data-id]');
    if(target && target.dataset.id!==current) viewer?.loadScene(target.dataset.id,0,'same');
    const button=e.target.closest('[data-style]');
    if(button && button.dataset.style!==style && styleReady(button.dataset.style)){
      const view={yaw:viewer.getYaw(),pitch:viewer.getPitch(),hfov:viewer.getHfov()};
      style=button.dataset.style;
      root.querySelector('.style-status').textContent='Загрузка стиля…';
      launch(view);update();
    }
    if(e.target.id==='full'){const stage=root.querySelector('.stage');if(document.fullscreenElement)document.exitFullscreen();else stage.requestFullscreen()}
    if(e.target.id==='toggle-map'){const map=root.querySelector('#map');map.hidden=!map.hidden;e.target.setAttribute('aria-expanded',String(!map.hidden))}
  });
  root.addEventListener('change',e=>{if(e.target.id==='quality-variant'){const view={yaw:viewer.getYaw(),pitch:viewer.getPitch(),hfov:viewer.getHfov()};quality=e.target.value;launch(view);return}if(e.target.id==='viewer-floor'){mapFloor=e.target.value;renderMap()}});
  if(!floors.length)root.querySelector('.map-panel').hidden=true;
  launch();update();
  const panoResize=new ResizeObserver(()=>viewer?.resize());panoResize.observe(root.querySelector('#pano'));
  document.addEventListener('fullscreenchange',()=>requestAnimationFrame(()=>viewer?.resize()));
  function heading(){const arrow=root.querySelector('.map-heading');if(arrow&&viewer?.isLoaded())arrow.style.transform='rotate('+((p.scenes.find(x=>x.id===current)?.mapHeading||0)+viewer.getYaw())+'deg)';requestAnimationFrame(heading)}
  requestAnimationFrame(heading);
})();
