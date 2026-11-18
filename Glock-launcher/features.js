// features.js - ładowany po głównym skrypcie z index.html, nadpisuje kilka funkcji i dokłada resztę
(function(){
var h = function(t, c, x){ return el(t, c, x); };
var LS = {
  get: function(k, d){ try { var v = localStorage.getItem('gl.' + k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set: function(k, v){ try { localStorage.setItem('gl.' + k, JSON.stringify(v)); } catch(e){} }
};
var loaderName = function(i){ return i.loader === 'fabric' ? 'Fabric' : i.loader === 'quilt' ? 'Quilt' : 'Vanilla'; };
var fmtB = function(b){ return b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : fmtSize(b); };
var goSide = function(n){ var b = document.querySelector('.tt button[data-r="' + n + '"]'); if(b) b.click(); };

// toast
var toastBox = h('div', 'toasts'); document.body.appendChild(toastBox);
function toast(msg, kind){
  var t = h('div', 'toast ' + (kind || ''), msg); toastBox.appendChild(t);
  setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ t.remove(); }, 250); }, 3200);
  while(toastBox.children.length > 4) toastBox.firstChild.remove();
}
window.toast = toast;
var _setStatus = setStatus;
window.setStatus = function(t, err){
  _setStatus(t, err);
  if(t && (err || /^(Zapisano|Skopiowano|Sklonowano|Zaimportowano|Backup|Dodano|Przywr|Zresetowano|Pobrano|Zaktualizowano|Przełączono|Zmieniono|Modpack|Gra zamknięta|Preset|Java|Nowa)/.test(t))) toast(t, err ? 'bad' : 'ok');
};

// własny kolor + tryb oszczędny
function rgbOf(c){ var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function hexOf(a){ return '#' + a.map(function(v){ return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
function mixc(a, b, t){ return a.map(function(v, i){ return v + (b[i] - v) * t; }); }
function derive(c){ var a = rgbOf(c); return [c, hexOf(mixc(a, [0,0,0], .3)), hexOf(mixc(a, [255,255,255], .4))]; }
COLORS['Własny'] = derive(LS.get('accentHex', '#3d6bff'));
$('accent').appendChild(new Option('Własny', 'Własny'));
function setEco(v){ LS.set('eco', v); document.body.classList.toggle('eco', v); if($('eco')) $('eco').checked = v; }
document.body.classList.toggle('eco', !!LS.get('eco', false));

// awatar + status online, powitanie + porada
var hd = document.querySelector('#v-home .page-head');
var av = h('img', 'hello-av'); av.alt = ''; av.width = 40; av.height = 40;
av.onerror = function(){ av.style.visibility = 'hidden'; }; av.onload = function(){ av.style.visibility = 'visible'; };
hd.insertBefore(av, $('hello'));
var net = h('span', 'chip net'); hd.appendChild(net);
function setNet(){ var on = navigator.onLine; net.className = 'chip net ' + (on ? 'on' : 'off'); net.textContent = on ? 'Online' : 'Offline'; }
setNet();
window.addEventListener('online', function(){ setNet(); toast('Połączono z internetem', 'ok'); });
window.addEventListener('offline', function(){ setNet(); toast('Brak internetu - mody i serwery nie zadziałają', 'bad'); });
window.hero = function(){
  var acc = accounts.find(function(a){ return a.id === activeAcc; });
  var nm = (acc && acc.nick) || S.nick || 'graczu';
  var hr = new Date().getHours();
  var g = hr < 5 ? 'Dobrej nocy' : hr < 12 ? 'Dzień dobry' : hr < 18 ? 'Cześć' : 'Dobry wieczór';
  $('hello').textContent = g + ', ' + nm;
  $('hsub').textContent = 'Minecraft ' + sel.version + ' · ' + (sel.loader === 'fabric' ? 'Fabric' : sel.loader === 'quilt' ? 'Quilt' : 'Vanilla');
  if(av.dataset.n !== nm){ av.dataset.n = nm; av.src = 'https://minotar.net/helm/' + encodeURIComponent(nm) + '/48.png'; }
};
var TIPS = [
  'F3 + B pokazuje hitboxy bytów.', 'F3 + H włącza zaawansowane opisy przedmiotów.',
  'Wiadro wody tuż przed lądowaniem zatrzyma upadek.', 'Kompas pokazuje punkt odrodzenia świata, nie północ.',
  'F2 robi zrzut ekranu - znajdziesz go w sekcji Zrzuty ekranu.', 'Przeciągnij plik .jar na okno launchera, żeby dodać mod.',
  'Ctrl + K otwiera paletę poleceń.', 'Ctrl + Enter uruchamia grę bez klikania.',
  'Sodium na Fabricu zwykle daje wyraźny wzrost FPS.', 'Gwiazdka ★ przypina instancję na górze listy.', 'Auto-mody dodają się tylko do instancji Minecrafta 1.21.4.', 'Ctrl + Shift + Enter odpala ostatnio graną instancję.', 'Zakładka „Zainstalowane” → FPS Boost dodaje Sodium, Lithium i spółkę jednym kliknięciem.', 'Przycisk przy instancji tworzy skrót na pulpicie - gra startuje bez launchera.'
];
var tip = h('div', 'hero-tip'); tip.title = 'Kliknij, żeby zobaczyć inną';
function nextTip(){ tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }
nextTip(); tip.onclick = nextTip;
document.querySelector('.hero').insertBefore(tip, document.querySelector('.hero-bar'));

// lista instalacji
var FAV = LS.get('favs', []), VIEW = LS.get('view', 'list'), SORT = LS.get('sort', 'recent'), QRY = '';
var SZ = {}, SZT = {};
function metaText(i){
  var s = (i.version === '1.21.4' && i.loader !== 'vanilla' ? 'auto-mody · ' : '') + loaderName(i) + ' · ' + (i.ram || 6) + ' GB · gra: ' + fmtT(i.playtime);
  if(SZ[i.id] != null) s += ' · ' + fmtB(SZ[i.id]);
  return s;
}
function sortedInsts(){
  var q = QRY.toLowerCase();
  var l = insts.filter(function(i){ return !q || ((i.name || '') + ' ' + i.version + ' ' + i.loader).toLowerCase().indexOf(q) > -1; });
  var cmp = {
    recent: function(a, b){ return new Date(b.lastPlayed || 0) - new Date(a.lastPlayed || 0); },
    time: function(a, b){ return (b.playtime || 0) - (a.playtime || 0); },
    name: function(a, b){ return String(a.name || a.version).localeCompare(String(b.name || b.version)); }
  }[SORT];
  return l.sort(function(a, b){
    var fa = FAV.indexOf(a.id) > -1, fb = FAV.indexOf(b.id) > -1;
    return fa !== fb ? (fa ? -1 : 1) : cmp(a, b);
  });
}
function toggleFav(id){
  var k = FAV.indexOf(id); if(k > -1) FAV.splice(k, 1); else FAV.push(id);
  LS.set('favs', FAV); renderList();
}
function ensureTools(){
  if($('list-tools')) return;
  var t = h('div', 'list-tools'); t.id = 'list-tools';
  var q = h('input'); q.type = 'text'; q.id = 'inst-q'; q.placeholder = 'Filtruj instalacje…'; q.spellcheck = false;
  q.oninput = function(){ QRY = q.value; renderList(); };
  var s = h('select'); s.title = 'Sortowanie';
  [['recent', 'Ostatnio grane'], ['time', 'Czas gry'], ['name', 'Nazwa']].forEach(function(o){ s.appendChild(new Option(o[1], o[0])); });
  s.value = SORT; s.onchange = function(){ SORT = s.value; LS.set('sort', SORT); renderList(); };
  var v = h('button', 'btn', VIEW === 'grid' ? '☰' : '▦'); v.title = 'Lista / kafelki';
  v.onclick = function(){ VIEW = VIEW === 'grid' ? 'list' : 'grid'; LS.set('view', VIEW); v.textContent = VIEW === 'grid' ? '☰' : '▦'; renderList(); };
  t.appendChild(q); t.appendChild(s); t.appendChild(v);
  $('list').parentNode.insertBefore(t, $('list'));
}
window.renderList = function(){
  ensureTools();
  var box = $('list'); box.innerHTML = ''; box.classList.toggle('grid', VIEW === 'grid');
  var list = sortedInsts(), metaEls = {};
  if(!insts.length) box.appendChild(h('p', 'empty', 'Brak instalacji. Kliknij GRAJ!, a pojawi się tutaj.'));
  else if(!list.length) box.appendChild(h('p', 'empty', 'Nic nie pasuje do „' + QRY + '”.'));
  list.forEach(function(i){
    var r = h('div', 'vi'); r.setAttribute('aria-current', i.id === slug());
    var fav = FAV.indexOf(i.id) > -1;
    var star = h('button', 'fav' + (fav ? ' on' : ''), fav ? '★' : '☆'); star.title = fav ? 'Odepnij' : 'Przypnij';
    star.onclick = function(e){ e.stopPropagation(); toggleFav(i.id); };
    var t = h('div', 't');
    t.appendChild(h('b', '', i.name || ('Minecraft ' + i.version)));
    var m = h('small', '', metaText(i)); t.appendChild(m); metaEls[i.id] = m;
    if(i.notes) t.appendChild(h('small', 'note', 'Notatka: ' + i.notes));
    var g = h('button', 'btn pri', 'Graj'); g.onclick = function(e){ e.stopPropagation(); choose(i); if(!busy) launch(); };
    var sc = h('button', 'btn', 'Skrót'); sc.title = 'Skrót na pulpicie (uruchamia grę bez launchera)';
    sc.onclick = async function(e){
      e.stopPropagation();
      try { await api.instShortcut(i.id); toast('Utworzono skrót na pulpicie: ' + (i.name || i.version), 'ok'); }
      catch(err){ toast(err.message, 'bad'); }
    };
    var x = h('button', 'btn x', '×');
    x.onclick = async function(e){ e.stopPropagation(); if(!confirm('Usunąć ' + (i.name || i.version) + '?')) return; try { await api.instDelete(i.id); await refresh(); } catch(err){ setStatus(err.message, true); } };
    r.appendChild(star);
    r.appendChild(h('div', 'ico', i.version.length > 6 ? i.version.slice(0, 6) : i.version));
    r.appendChild(t); r.appendChild(g); r.appendChild(sc); r.appendChild(x);
    r.onclick = function(){ choose(i); };
    box.appendChild(r);
    if(api.instSize && !SZT[i.id]){
      SZT[i.id] = 1;
      api.instSize(i.id).then(function(b){ SZ[i.id] = b; if(metaEls[i.id] && metaEls[i.id].isConnected) metaEls[i.id].textContent = metaText(i); }).catch(function(){});
    }
  });
};
var _choose = window.choose;
window.choose = function(i){ _choose(i); if($('r-inst') && $('r-inst').classList.contains('on')) renderMods(); };

// notatki w oknie edycji
(function(){
  var row = $('modal-save').parentNode;
  var lab = h('label', null, 'Notatka'); lab.setAttribute('for', 'me-notes');
  var ta = h('textarea'); ta.id = 'me-notes'; ta.rows = 3; ta.maxLength = 200; ta.placeholder = 'np. serwer ze znajomymi, mody PvP…';
  row.parentNode.insertBefore(lab, row); row.parentNode.insertBefore(ta, row);
  var _oem = window.openEditModal;
  window.openEditModal = function(id){ _oem(id); var i = insts.find(function(x){ return x.id === id; }); ta.value = (i && i.notes) || ''; };
  $('modal-save').addEventListener('click', function(){ api.instUpdate($('modal-edit').dataset.id, { notes: ta.value.trim() }); }, true);
})();

// menedżer zainstalowanych modów
var MODS = [];
(function(){
  var tb = h('button', null, 'Zainstalowane'); tb.setAttribute('role', 'tab'); tb.dataset.r = 'inst'; tb.setAttribute('aria-selected', 'false');
  document.querySelector('.tt').appendChild(tb);
  var p = h('div', 'pane'); p.id = 'r-inst';
  var r1 = h('div', 'row');
  var q = h('input'); q.type = 'text'; q.id = 'mq'; q.placeholder = 'Filtruj zainstalowane…'; q.spellcheck = false; q.oninput = drawMods;
  var rf = h('button', 'btn', '⟳'); rf.title = 'Odśwież'; rf.onclick = renderMods;
  r1.appendChild(q); r1.appendChild(rf);
  var r2 = h('div', 'row'); r2.style.marginTop = '10px';
  var on = h('button', 'btn w', 'Włącz wszystkie'), off = h('button', 'btn w', 'Wyłącz wszystkie');
  on.onclick = function(){ setAll(true); }; off.onclick = function(){ setAll(false); };
  r2.appendChild(on); r2.appendChild(off);
  var cnt = h('p', 'sub'); cnt.id = 'mcount'; cnt.style.margin = '12px 0 10px';
  var list = h('div', 'scroll'); list.id = 'mlist';
  p.appendChild(r1); p.appendChild(r2); p.appendChild(cnt); p.appendChild(list);
  document.querySelector('.side').appendChild(p);
  tb.addEventListener('click', renderMods);
})();
async function renderMods(){
  var i = cur(), box = $('mlist'); if(!box) return;
  if(!i){ box.innerHTML = ''; box.appendChild(h('p', 'empty', 'Brak instancji. Kliknij GRAJ!, a pojawi się tutaj.')); $('mcount').textContent = ''; MODS = []; return; }
  try { MODS = await api.modsList(i.id); } catch(e){ box.innerHTML = ''; box.appendChild(h('p', 'empty', 'Błąd: ' + e.message)); return; }
  drawMods();
}
function drawMods(){
  var i = cur(), box = $('mlist'); if(!i) return;
  var q = ($('mq').value || '').toLowerCase();
  var l = MODS.filter(function(m){ return !q || m.name.toLowerCase().indexOf(q) > -1; });
  var en = MODS.filter(function(m){ return m.enabled; }).length;
  $('mcount').textContent = 'Mody: ' + MODS.length + ' (włączone: ' + en + ')';
  box.innerHTML = '';
  if(!l.length){ box.appendChild(h('p', 'empty', MODS.length ? 'Nic nie pasuje.' : 'Brak modów w tej instancji.')); return; }
  l.forEach(function(m){
    var r = h('div', 'mrow' + (m.enabled ? '' : ' off'));
    var nm = h('div', 'nm'); nm.appendChild(h('b', '', m.name.replace(/\.jar(\.disabled)?$/i, '')));
    nm.appendChild(h('small', '', fmtSize(m.size)));
    var sw = h('span', 'sw'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = m.enabled; cb.title = m.enabled ? 'Wyłącz' : 'Włącz';
    cb.onchange = async function(){ try { await api.modToggle(i.id, m.name); } catch(e){ setStatus(e.message, true); } renderMods(); };
    sw.appendChild(cb);
    var d = h('button', 'btn x', '×');
    d.onclick = async function(){ if(!confirm('Usunąć ' + m.name + '?')) return; try { await api.modDelete(i.id, m.name); } catch(e){ setStatus(e.message, true); } renderMods(); };
    r.appendChild(nm); r.appendChild(sw); r.appendChild(d); box.appendChild(r);
  });
}
async function setAll(state){
  var i = cur(); if(!i) return;
  var todo = MODS.filter(function(m){ return m.enabled !== state; });
  try { await api.modsSetAll(i.id, state); } catch(e){ toast(e.message, 'bad'); }
  toast((state ? 'Włączono: ' : 'Wyłączono: ') + todo.length, 'ok'); renderMods();
}

// przeciągnij i upuść
var dz = h('div', 'dropzone', 'Upuść pliki .jar (mody) lub .zip (tekstury)'); dz.hidden = true; document.body.appendChild(dz);
var dragN = 0;
window.addEventListener('dragenter', function(e){ if(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') > -1){ dragN++; dz.hidden = false; } });
window.addEventListener('dragleave', function(){ dragN = Math.max(0, dragN - 1); if(!dragN) dz.hidden = true; });
window.addEventListener('dragover', function(e){ e.preventDefault(); });
window.addEventListener('drop', async function(e){
  e.preventDefault(); dragN = 0; dz.hidden = true;
  var files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []); if(!files.length) return;
  if(!api.addFiles || !api.pathFor){ toast('Podmień też main.js i preload.js na nowe', 'bad'); return; }
  try {
    var paths = files.map(function(f){ return api.pathFor(f); }).filter(Boolean);
    var i = cur() || await upsert();
    var r = await api.addFiles(i.id, paths);
    toast('Dodano plików: ' + r.added.length + (r.skipped.length ? ' · pominięto: ' + r.skipped.length : ''), r.added.length ? 'ok' : 'bad');
    delete SZT[i.id]; renderMods();
  } catch(err){ toast(err.message, 'bad'); }
});

// licznik sesji
var tmr = null, t0 = 0;
function clock(s){ var hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = function(n){ return (n < 10 ? '0' : '') + n; }; return (hh ? hh + ':' : '') + p(m) + ':' + p(x); }
function stopT(){ clearInterval(tmr); tmr = null; }
api.onStatus(function(t){
  if(t === 'Gra uruchomiona'){
    stopT(); t0 = Date.now();
    tmr = setInterval(function(){ if(busy && !document.hidden) $('play').textContent = 'GRA DZIAŁA · ' + clock(Math.floor((Date.now() - t0) / 1000)); }, 1000);
  }
});
api.onClosed(function(){ stopT(); SZT = {}; renderList(); });
api.onError(stopT);

// aktualizacje wszystkich instancji
function setBadge(n){
  var b = document.querySelector('.rb[data-v="instances"]'), o = b.querySelector('.badge'); if(o) o.remove();
  if(n > 0) b.appendChild(h('span', 'badge', String(n)));
}
async function checkAllUpdates(){
  if(!insts.length){ toast('Brak instancji', 'bad'); return; }
  toast('Sprawdzam aktualizacje modów…');
  var total = 0, first = null;
  for(var k = 0; k < insts.length; k++){
    try { var u = await api.modsCheckUpdates(insts[k].id); total += u.length; if(u.length && !first) first = insts[k].id; } catch(e){}
  }
  setBadge(total);
  if(!total){ toast('Wszystkie mody są aktualne', 'ok'); return; }
  toast('Dostępne aktualizacje: ' + total, 'ok');
  try { await checkModUpdates(first); } catch(e){}
}
var cu = h('button', 'btn w', 'Sprawdź aktualizacje'); cu.onclick = checkAllUpdates;
document.querySelector('.list-actions').appendChild(cu);

// serwery: odświeżanie
var rs = h('button', 'btn w', 'Odśwież status serwerów'); rs.style.marginTop = '8px';
rs.onclick = function(){ renderServers(); toast('Odświeżam serwery…'); };
$('srv-add').parentNode.insertAdjacentElement('afterend', rs);
setInterval(function(){ if($('r-srv').classList.contains('on') && !document.hidden) renderServers(); }, 60000);

// ustawienia: RAM, kolor, tryb oszczędny, eksport/import
(function(){
  function setRam(v){ var r = $('ram'); r.value = Math.min(+r.max, v); r.dispatchEvent(new Event('input')); }
  var rr = h('div', 'preset-row');
  [4, 6, 8].forEach(function(g){ var b = h('button', 'btn', g + ' GB'); b.onclick = function(){ setRam(g); }; rr.appendChild(b); });
  var auto = h('button', 'btn primary', 'Auto RAM');
  auto.onclick = function(){
    var total = (+$('ram').max) + 2, rec = Math.max(4, Math.min(8, Math.floor(total / 2)));
    setRam(rec); toast('Zalecane ' + rec + ' GB (masz ok. ' + total + ' GB)', 'ok');
  };
  rr.appendChild(auto); $('ram').insertAdjacentElement('afterend', rr);

  var form = document.querySelector('#v-set .form'), xs = h('div', 'xset');
  xs.appendChild(h('h2', null, 'Wygląd i dane'));
  var l1 = h('label', null, 'Własny kolor motywu'); l1.setAttribute('for', 'accent-hex');
  var hex = h('input'); hex.type = 'color'; hex.id = 'accent-hex'; hex.value = LS.get('accentHex', '#3d6bff');
  hex.oninput = function(){ COLORS['Własny'] = derive(hex.value); $('accent').value = 'Własny'; applyAccent('Własny'); };
  hex.onchange = function(){ LS.set('accentHex', hex.value); S.accent = 'Własny'; api.saveSettings({ accent: 'Własny' }); };
  var c1 = h('label', 'chk'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'eco'; cb.checked = !!LS.get('eco', false);
  cb.onchange = function(){ setEco(cb.checked); };
  c1.appendChild(cb); c1.appendChild(document.createTextNode(' Tryb oszczędny (bez animacji i rozmycia)'));
  var row = h('div', 'row'); row.style.marginTop = '16px';
  var ex = h('button', 'btn w', 'Eksportuj ustawienia'), im = h('button', 'btn w', 'Importuj ustawienia');
  var fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json'; fi.hidden = true;
  ex.onclick = exportSettings; im.onclick = function(){ fi.click(); };
  fi.onchange = async function(){
    try {
      var f = fi.files[0]; if(!f) return;
      var d = JSON.parse(await f.text()); if(d.app !== 'glock-launcher' || !d.settings) throw new Error('To nie jest plik ustawień Glock-launchera');
      var s = d.settings, keep = {};
      ['nick', 'accounts', 'activeAccount', 'servers', 'accent', 'snapshots'].forEach(function(k){ if(s[k] !== undefined) keep[k] = s[k]; });
      await api.saveSettings(keep);
      var u = d.ui || {}; Object.keys(u).forEach(function(k){ LS.set(k, u[k]); });
      toast('Zaimportowano - przeładowuję…', 'ok'); setTimeout(function(){ location.reload(); }, 700);
    } catch(e){ toast(e.message, 'bad'); }
  };
  row.appendChild(ex); row.appendChild(im);
  [l1, hex, c1, row, fi].forEach(function(n){ xs.appendChild(n); });
  form.insertBefore(xs, $('reset-settings').parentNode);
})();
function exportSettings(){
  var data = { app: 'glock-launcher', ver: 1, settings: S, ui: { favs: FAV, view: VIEW, sort: SORT, eco: !!LS.get('eco', false), accentHex: LS.get('accentHex', '#3d6bff') } };
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'glock-launcher-ustawienia.json'; document.body.appendChild(a); a.click(); a.remove();
  toast('Wyeksportowano ustawienia', 'ok');
}

// logi
var logQ = '', autoScroll = true, logDirty = false, logPending = false;
function doRenderLogs(){
  logPending = false;
  if(!$('v-logs').classList.contains('on')){ logDirty = true; return; }
  logDirty = false;
  var box = $('log'), q = logQ.toLowerCase();
  var list = logsAll.filter(function(l){ return (logFilter === 'all' || l.type === logFilter) && (!q || l.text.toLowerCase().indexOf(q) > -1); });
  var frag = document.createDocumentFragment();
  list.slice(-800).forEach(function(l){ frag.appendChild(h('div', 'll ' + l.type, l.text)); });
  box.innerHTML = ''; box.appendChild(frag);
  if(autoScroll) box.scrollTop = box.scrollHeight;
  var er = logsAll.filter(function(l){ return l.type === 'error'; }).length, wr = logsAll.filter(function(l){ return l.type === 'warn'; }).length;
  $('log-cnt').textContent = 'Błędy: ' + er + ' · Ostrzeżenia: ' + wr;
}
window.renderLogs = function(){ if(logPending) return; logPending = true; requestAnimationFrame(doRenderLogs); };
document.querySelector('.rb[data-v="logs"]').addEventListener('click', function(){ setTimeout(doRenderLogs, 0); });
(function(){
  var t = h('div', 'row'); t.style.cssText = 'margin-bottom:10px;flex-wrap:wrap';
  var q = h('input'); q.type = 'text'; q.id = 'log-q'; q.placeholder = 'Szukaj w logach…'; q.spellcheck = false;
  q.oninput = function(){ logQ = q.value; renderLogs(); };
  var a = h('label', 'chk'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; a.style.margin = '0';
  cb.onchange = function(){ autoScroll = cb.checked; if(autoScroll) renderLogs(); };
  a.appendChild(cb); a.appendChild(document.createTextNode(' Autoprzewijanie'));
  var c = h('span', 'chip'); c.id = 'log-cnt'; c.textContent = 'Błędy: 0 · Ostrzeżenia: 0';
  var d = h('button', 'btn', 'Kopiuj raport'); d.title = 'Wersja, RAM, Java i ostatnie linie logu'; d.onclick = copyDiag;
  [q, a, c, d].forEach(function(n){ t.appendChild(n); });
  $('log').parentNode.insertBefore(t, $('log'));
})();
async function copyDiag(){
  var i = cur() || {}, si = {};
  try { si = await api.sysInfo(); } catch(e){}
  var lines = ['Glock-launcher v' + (si.version || '?'),
    'System: ' + (si.platform || '?') + ' ' + (si.arch || '') + ' ' + (si.release || '') + (si.session ? ' (' + si.session + ')' : ''),
    'CPU: ' + (si.cpu || '?') + ' x' + (si.cores || '?') + ' · RAM systemu: ' + (si.totalGb || '?') + ' GB',
    'Electron ' + (si.electron || '?') + ' · Chromium ' + (si.chrome || '?'),
    'Minecraft: ' + sel.version + ' (' + sel.loader + ')',
    'RAM gry: ' + (i.ram || $('ram').value) + ' GB', 'Java: ' + (i.javaPath || 'auto'),
    'JVM: ' + ((i.jvmArgs || '-').slice(0, 140)), 'Online: ' + navigator.onLine, 'Dane: ' + (si.dataDir || '?'),
    '--- ostatnie linie logu ---'].concat(logsAll.slice(-30).map(function(l){ return l.text; }));
  navigator.clipboard.writeText(lines.join('\n')).then(function(){ toast('Skopiowano raport diagnostyczny', 'ok'); }, function(){ toast('Nie udało się skopiować', 'bad'); });
}

// paleta poleceń + skróty
var pal = h('div', 'pal'); pal.hidden = true;
var palBox = h('div', 'pal-box'), palQ = h('input'), palL = h('div'), palIdx = 0, palItems = [];
palQ.type = 'text'; palQ.placeholder = 'Wpisz polecenie, sekcję lub instancję…'; palQ.spellcheck = false;
palBox.appendChild(palQ); palBox.appendChild(palL); palBox.appendChild(h('div', 'pal-hint', '↑↓ wybór · Enter uruchom · Esc zamknij'));
pal.appendChild(palBox); document.body.appendChild(pal);
function commands(){
  var c = [{ t: 'Graj', s: 'Uruchom wybraną instancję (Ctrl+Enter)', f: function(){ if(!busy) launch(); } }];
  document.querySelectorAll('.rb').forEach(function(b, k){ c.push({ t: 'Przejdź: ' + b.title, s: 'Ctrl+' + (k + 1), f: function(){ b.click(); } }); });
  c.push({ t: 'Szukaj modów', s: 'Modrinth', f: function(){ goSide('mods'); $('q').focus(); } });
  c.push({ t: 'Zainstalowane mody', s: 'Menedżer modów', f: function(){ goSide('inst'); } });
  c.push({ t: 'Sprawdź aktualizacje modów', s: 'Wszystkie instancje', f: checkAllUpdates });
  c.push({ t: 'Przełącz tryb oszczędny', s: 'Bez animacji i rozmycia', f: function(){ setEco(!LS.get('eco', false)); toast('Tryb oszczędny: ' + (LS.get('eco', false) ? 'włączony' : 'wyłączony'), 'ok'); } });
  c.push({ t: 'Skopiuj raport diagnostyczny', s: 'Do schowka', f: copyDiag });
  c.push({ t: 'Eksportuj ustawienia', s: 'Plik JSON', f: exportSettings });
  insts.forEach(function(i){ c.push({ t: 'Instancja: ' + (i.name || i.version), s: i.version + ' · ' + loaderName(i), f: function(){ choose(i); } }); });
  return c;
}
function drawPal(){
  var words = palQ.value.toLowerCase().split(/\s+/).filter(Boolean);
  palItems = commands().filter(function(c){ var s = (c.t + ' ' + (c.s || '')).toLowerCase(); return words.every(function(w){ return s.indexOf(w) > -1; }); }).slice(0, 9);
  palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
  palL.innerHTML = '';
  if(!palItems.length) palL.appendChild(h('p', 'empty', 'Brak wyników.'));
  palItems.forEach(function(c, k){
    var r = h('div', 'pal-item' + (k === palIdx ? ' on' : ''));
    r.appendChild(h('span', '', c.t)); r.appendChild(h('small', '', c.s || ''));
    r.onmousedown = function(e){ e.preventDefault(); runCmd(c); };
    palL.appendChild(r);
  });
}
function togglePal(force){
  var open = force !== undefined ? force : pal.hidden;
  pal.hidden = !open;
  if(open){ palQ.value = ''; palIdx = 0; drawPal(); setTimeout(function(){ palQ.focus(); }, 0); }
}
function runCmd(c){ togglePal(false); setTimeout(c.f, 0); }
palQ.addEventListener('input', function(){ palIdx = 0; drawPal(); });
palQ.addEventListener('keydown', function(e){
  if(e.key === 'ArrowDown'){ e.preventDefault(); palIdx = Math.min(palIdx + 1, palItems.length - 1); drawPal(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); drawPal(); }
  else if(e.key === 'Enter'){ e.preventDefault(); if(palItems[palIdx]) runCmd(palItems[palIdx]); }
  else if(e.key === 'Escape'){ togglePal(false); }
});
pal.addEventListener('mousedown', function(e){ if(e.target === pal) togglePal(false); });
document.addEventListener('keydown', function(e){
  var mod = e.ctrlKey || e.metaKey, typing = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
  if(mod && e.key.toLowerCase() === 'k'){ e.preventDefault(); togglePal(); return; }
  if(mod && e.key === 'Enter' && e.target !== palQ){ e.preventDefault(); if(!busy) launch(); return; }
  if(mod && /^[1-9]$/.test(e.key)){ var b = document.querySelectorAll('.rb')[+e.key - 1]; if(b){ e.preventDefault(); b.click(); } return; }
  if(e.key === '/' && !typing && pal.hidden){ e.preventDefault(); goSide('mods'); $('q').focus(); }
});

// dodatki: znacznik auto-modów, skrót na pulpicie, przerwy, foldery
(function(){
  var BMC = '1.21.4';
  if(api.bundledInfo) api.bundledInfo().then(function(r){ if(r && r.mc) BMC = r.mc; }).catch(function(){});
  function runBundled(){
    var i = cur(); if(!i){ toast('Wybierz instancję', 'bad'); return; }
    if(i.version !== BMC){ toast('Auto-mody działają tylko na Minecrafcie ' + BMC, 'bad'); return; }
    api.installBundledMods(i.id).then(function(r){
      if(r && r.error) toast(r.error, 'bad');
      else toast('Auto-mody: dodano ' + ((r && r.copied.length) || 0) + ', pominięto ' + ((r && r.skipped.length) || 0), 'ok');
      renderMods();
    }).catch(function(e){ toast(e.message, 'bad'); });
  }
  function playLast(){
    if(busy) return;
    var l = insts.slice().sort(function(a, b){ return new Date(b.lastPlayed || 0) - new Date(a.lastPlayed || 0); })[0];
    if(!l){ toast('Brak instancji', 'bad'); return; }
    choose(l); launch();
  }
  var brk = LS.get('breakMin', 0), brkT = null;
  function armBreak(){ clearTimeout(brkT); if(brk > 0) brkT = setTimeout(function(){ toast('Grasz już ' + brk + ' min - zrób przerwę', 'ok'); armBreak(); }, brk * 60000); }
  api.onStatus(function(t){ if(t === 'Gra uruchomiona') armBreak(); });
  api.onClosed(function(){ clearTimeout(brkT); });
  api.onError(function(){ clearTimeout(brkT); });
  function openF(sub){ var i = cur(); if(!i){ toast('Wybierz instancję', 'bad'); return; } api.openSub(i.id, sub); }
  function copyNick(){
    var acc = accounts.find(function(a){ return a.id === activeAcc; }), nm = (acc && acc.nick) || S.nick || '';
    navigator.clipboard.writeText(nm).then(function(){ toast('Skopiowano nick: ' + nm, 'ok'); }, function(){ toast('Nie udało się skopiować', 'bad'); });
  }
  var _cmds = commands;
  commands = function(){
    var c = _cmds();
    c.push({ t: 'Graj ostatnio grane', s: 'Ostatnia instancja (Ctrl+Shift+Enter)', f: playLast });
    c.push({ t: 'Dodaj auto-mody (' + BMC + ')', s: 'Tylko Minecraft ' + BMC, f: runBundled });
    c.push({ t: 'Otwórz folder modów', s: 'Wybrana instancja', f: function(){ openF('mods'); } });
    c.push({ t: 'Otwórz folder zrzutów', s: 'Wybrana instancja', f: function(){ openF('screenshots'); } });
    c.push({ t: 'Otwórz folder światów', s: 'Wybrana instancja', f: function(){ openF('saves'); } });
    c.push({ t: 'Utwórz skrót na pulpicie', s: 'Wybrana instancja - gra bez launchera', f: function(){ var i = cur(); if(!i){ toast('Wybierz instancję', 'bad'); return; } api.instShortcut(i.id).then(function(){ toast('Utworzono skrót na pulpicie', 'ok'); }).catch(function(e){ toast(e.message, 'bad'); }); } });
    c.push({ t: 'Kopiuj nick', s: 'Do schowka', f: copyNick });
    return c;
  };
  document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter'){ e.preventDefault(); playLast(); }
  });
  var xs = document.querySelector('#v-set .xset');
  if(xs){
    var l = h('label', null, 'Przypomnienie o przerwie (minuty, 0 = wyłączone)'); l.setAttribute('for', 'brk');
    var inp = h('input'); inp.type = 'number'; inp.id = 'brk'; inp.min = 0; inp.max = 240; inp.value = brk;
    inp.onchange = function(){ brk = Math.max(0, Math.min(240, +inp.value || 0)); inp.value = brk; LS.set('breakMin', brk); toast(brk ? 'Przypomnienie co ' + brk + ' min' : 'Przypomnienie wyłączone', 'ok'); };
    var b = h('button', 'btn w', 'Dodaj auto-mody (' + BMC + ')'); b.style.marginTop = '10px'; b.onclick = runBundled;
    xs.appendChild(l); xs.appendChild(inp); xs.appendChild(b);
  }
})();
// dodatki: FPS Boost, grafika, czyszczenie, tryb gry
(function(){
  // tryb gry: gdy gra działa, launcher wyłącza animacje i rozmycia (więcej zasobów dla Minecrafta)
  api.onStatus(function(t){ if(t === 'Gra uruchomiona') document.body.classList.add('playing'); });
  api.onClosed(function(){ document.body.classList.remove('playing'); });
  api.onError(function(){ document.body.classList.remove('playing'); });

  // FPS Boost
  function fpsBoost(){
    var i = cur(); if(!i){ toast('Wybierz instancję', 'bad'); return; }
    if(i.loader === 'vanilla'){ toast('FPS Boost wymaga Fabrica lub Quilta', 'bad'); return; }
    if(!confirm('Zainstalować mody poprawiające FPS (Sodium, Lithium, FerriteCore, ModernFix, Entity Culling, ImmediatelyFast) w „' + (i.name || i.version) + '”?')) return;
    toast('FPS Boost: pobieram mody…');
    api.fpsBoost(i.id).then(function(r){
      toast('FPS Boost: zainstalowano ' + r.installed.length + (r.failed.length ? ' · błędy: ' + r.failed.length : ''), r.installed.length ? 'ok' : 'bad');
      if(r.failed.length) console.warn('FPS Boost:', r.failed);
      renderMods();
    }).catch(function(e){ toast(e.message, 'bad'); });
  }
  // grafika (options.txt)
  function gfx(p){
    var i = cur(); if(!i){ toast('Wybierz instancję', 'bad'); return; }
    api.optOptions(i.id, p).then(function(){ toast('Ustawienia grafiki: ' + (p === 'fps' ? 'maks. FPS' : 'zbalansowane') + ' (zamknij grę przed zmianą)', 'ok'); })
      .catch(function(e){ toast(e.message, 'bad'); });
  }
  // czyszczenie
  function cleanTemp(){
    api.cleanTemp().then(function(b){ toast('Wyczyszczono: ' + fmtB(b || 0), 'ok'); delete SZT[(cur() || {}).id]; })
      .catch(function(e){ toast(e.message, 'bad'); });
  }
  // kopiuj listę modów
  function copyMods(){
    var l = MODS.filter(function(m){ return m.enabled; }).map(function(m){ return m.name.replace(/\.jar$/i, ''); });
    if(!l.length){ toast('Brak włączonych modów', 'bad'); return; }
    navigator.clipboard.writeText(l.join('\n')).then(function(){ toast('Skopiowano ' + l.length + ' modów', 'ok'); }, function(){ toast('Nie udało się skopiować', 'bad'); });
  }

  // przyciski w zakładce „Zainstalowane”
  var pane = $('r-inst');
  if(pane){
    var r3 = h('div', 'row'); r3.style.marginTop = '10px'; r3.style.flexWrap = 'wrap';
    var b1 = h('button', 'btn pri w', 'FPS Boost'); b1.title = 'Sodium, Lithium, FerriteCore, ModernFix, Entity Culling, ImmediatelyFast'; b1.onclick = fpsBoost;
    var b2 = h('button', 'btn w', 'Grafika: maks. FPS'); b2.onclick = function(){ gfx('fps'); };
    var b3 = h('button', 'btn w', 'Grafika: zbalansowana'); b3.onclick = function(){ gfx('balanced'); };
    var b4 = h('button', 'btn w', 'Kopiuj listę modów'); b4.onclick = copyMods;
    [b1, b2, b3, b4].forEach(function(b){ r3.appendChild(b); });
    pane.insertBefore(r3, $('mcount'));
  }
  // ustawienia: czyszczenie
  var xs2 = document.querySelector('#v-set .xset');
  if(xs2){
    var cl = h('button', 'btn w', 'Wyczyść pliki tymczasowe i stare logi'); cl.style.marginTop = '10px'; cl.onclick = cleanTemp;
    xs2.appendChild(cl);
  }
  // paleta poleceń
  var _cmds2 = commands;
  commands = function(){
    var c = _cmds2();
    c.push({ t: 'FPS Boost (mody wydajnościowe)', s: 'Wybrana instancja', f: fpsBoost });
    c.push({ t: 'Grafika: maks. FPS', s: 'Zmienia options.txt', f: function(){ gfx('fps'); } });
    c.push({ t: 'Grafika: zbalansowana', s: 'Zmienia options.txt', f: function(){ gfx('balanced'); } });
    c.push({ t: 'Wyczyść pliki tymczasowe', s: 'Stare logi i crash-reporty', f: cleanTemp });
    c.push({ t: 'Kopiuj listę modów', s: 'Włączone mody wybranej instancji', f: function(){ renderMods().then(copyMods); } });
    return c;
  };

  // łączny czas gry w nagłówku strony głównej
  var _hero = window.hero;
  window.hero = function(){
    _hero();
    var tot = insts.reduce(function(a, i){ return a + (i.playtime || 0); }, 0);
    if(tot > 0 && $('hsub')) $('hsub').textContent += ' · łącznie: ' + fmtT(tot);
  };

  // migracja: stary preset „FPS Gaming” miał AlwaysPreTouch (wolny start, zajmuje cały RAM z góry)
  var _refresh = window.refresh;
  window.refresh = async function(){
    var r = await _refresh.apply(this, arguments);
    try {
      if(insts.length && !LS.get('mig411', false)){
        var old = insts.filter(function(i){ var a = i.jvmArgs || ''; return /AlwaysPreTouch/.test(a) && /MaxGCPauseMillis=50/.test(a) && /UseStringDeduplication/.test(a); });
        for(var k = 0; k < old.length; k++){ await api.instUpdate(old[k].id, { jvmArgs: JVM_PRESETS.fps }); old[k].jvmArgs = JVM_PRESETS.fps; }
        if(old.length) toast('Zaktualizowano preset JVM w ' + old.length + ' instancji (szybszy start)', 'ok');
        LS.set('mig411', true);
      }
    } catch(e){}
    return r;
  };
})();
})();
