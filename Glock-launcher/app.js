if (!window.api) {
  window.api = {
    init: async () => ({ settings: { nick: 'Steve', maxRam: 16, servers: [], accounts: [{ id: 'default', nick: 'Steve' }], activeAccount: 'default' } }),
    saveSettings: async () => {}, settingsReset: async () => ({}),
    getVersions: async () => ['1.21.4','1.20.4','1.20.1','1.19.2','1.18.2','1.16.5'].map(id => ({ id, type: 'release' })),
    accountsList: async () => ({ accounts: [{ id: 'default', nick: 'Steve' }], active: 'default' }),
    accountsSave: async () => [], accountsDelete: async () => ({ accounts: [], active: 'default' }),
    accountsSwitch: async () => true,
    instList: async () => [], instSave: async () => {}, instUpdate: async () => {}, instDelete: async () => {},
    instOpen: async () => {}, instClone: async () => {}, instBackup: async () => {}, instImport: async () => null,
    backupsList: async () => [], backupsRestore: async () => null, backupsDelete: async () => {}, backupsOpen: async () => {},
    openSub: async () => {}, worldsList: async () => [], worldsDelete: async () => {}, worldsBackup: async () => {},
    shotsList: async () => [], shotsDelete: async () => {}, shotsOpen: async () => {},
    javaList: async () => [], pickJava: async () => null,
    modsList: async () => [], modToggle: async () => {}, modDelete: async () => {},
    modsCheckUpdates: async () => [], modsApplyUpdates: async () => true,
    launch: async () => { throw new Error('Brak backendu'); },
    onProgress: () => {}, onStatus: () => {}, onLog: () => {}, onClosed: () => {}, onError: () => {},
    mrSearch: async () => ({ total: 0, hits: [] }),
    mrInstall: async () => { throw new Error('Brak backendu'); },
    modpackInstall: async () => { throw new Error('Brak backendu'); },
    crashAnalyze: async () => ({ ok: false, errors: [], message: 'Brak backendu' }),
    srvPing: async () => ({ online: false }),
    logSave: async () => false, openUrl: async (u) => window.open(u, '_blank')
  };
}
var $ = function(id){ return document.getElementById(id); };
var COLORS = { Lapis: ['#3d6bff','#2a4fd1','#7d9bff'], Szmaragd: ['#2fbf71','#1f8f54','#6fe0a0'], Redstone: ['#e5483b','#a9302a','#ff8a7e'], Ametyst: ['#9b5de5','#7140b0','#c39af0'], Neon: ['#00a2ff','#0069b8','#6cc8ff'], Złoto: ['#e9a825','#b07d12','#ffd36b'] };
var S = {}, insts = [], versions = [], sel = { version: '1.21.4', loader: 'fabric' }, busy = false, total = 0, offset = 0;
var logsAll = [], logFilter = 'all';
var accounts = [], activeAcc = 'default';
var JVM_PRESETS = {
  fps: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=30 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=16M -XX:G1ReservePercent=20 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:SurvivorRatio=32 -XX:MaxTenuringThreshold=1 -XX:+PerfDisableSharedMem',
  aikar: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true',
  g1gc: '-XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions',
  lowend: '-XX:+UseSerialGC -Xss1M',
  zgc: '-XX:+UseZGC -XX:+UnlockExperimentalVMOptions -XX:+ZGenerational',
  clear: ''
};
function el(t, c, x){ var e = document.createElement(t); if(c) e.className = c; if(x != null) e.textContent = x; return e; }
function setStatus(t, err){ var s = $('status'); if(!s) return; s.textContent = t; s.classList.toggle('err', !!err); }
function validNick(n){ return /^[A-Za-z0-9_]{3,16}$/.test(n); }
function vtype(id){ var v = versions.find(x => x.id === id); return (v && v.type) || 'release'; }
function slug(){ return sel.version + '-' + sel.loader; }
function cur(){ return insts.find(i => i.id === slug()); }
function fmtT(s){ var m = Math.floor((s||0)/60); return m < 60 ? m + ' min' : Math.floor(m/60) + ' h ' + (m%60) + ' min'; }
function fmtSize(b){ if(b < 1024) return b + ' B'; if(b < 1024*1024) return (b/1024).toFixed(1) + ' KB'; return (b/1024/1024).toFixed(1) + ' MB'; }
function applyAccent(n){ var c = COLORS[n] || COLORS.Lapis, r = document.documentElement.style; r.setProperty('--accent',c[0]); r.setProperty('--accent-d',c[1]); r.setProperty('--accent-l',c[2]); }
function classifyLog(l){ if(/error|exception|failed|fatal|crash/i.test(l)) return 'error'; if(/warn/i.test(l)) return 'warn'; return 'info'; }

document.addEventListener('click', function(e){
  var rb = e.target.closest('.rb');
  if(rb){
    document.querySelectorAll('.rb').forEach(x => x.setAttribute('aria-selected', x===rb?'true':'false'));
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + rb.dataset.v));
    loadView(rb.dataset.v); return;
  }
  var tt = e.target.closest('.tt button');
  if(tt){
    document.querySelectorAll('.tt button').forEach(x => x.setAttribute('aria-selected', x===tt?'true':'false'));
    document.querySelectorAll('.pane').forEach(x => x.classList.toggle('on', x.id === 'r-' + tt.dataset.r));
    return;
  }
});
function loadView(v){
  if(v === 'instances') loadInstancesView();
  else if(v === 'accounts') loadAccountsView();
  else if(v === 'worlds') loadWorldsView();
  else if(v === 'shots') loadShotsView();
  else if(v === 'skins') loadSkinsView();
  else if(v === 'stats') loadStatsView();
}

async function upsert(patch){
  patch = patch || {};
  var existing = cur();
  var base = existing || { name: sel.version, version: sel.version, loader: sel.loader, ram: +$('ram').value || 6, javaPath: '', jvmArgs: JVM_PRESETS.fps, width: 1280, height: 720, fullscreen: false, server: '', minimize: true, playtime: 0 };
  var i = Object.assign({}, base, patch, { id: slug() });
  await api.instSave(i); await refresh(); return i;
}
async function refresh(){ try { insts = await api.instList(); } catch { insts = []; } renderList(); stats(); }

function hero(){
  var acc = accounts.find(a => a.id === activeAcc);
  var nm = (acc && acc.nick) || S.nick || 'graczu';
  $('hello').textContent = 'Witaj z powrotem, ' + nm + '!';
  $('hsub').textContent = 'Minecraft ' + sel.version + ' · ' + (sel.loader === 'fabric' ? 'Fabric' : sel.loader === 'quilt' ? 'Quilt' : 'Vanilla');
}
function stats(){
  hero();
  var i = cur();
  $('st-time').textContent = fmtT(i && i.playtime);
  $('st-last').textContent = i && i.lastPlayed ? new Date(i.lastPlayed).toLocaleDateString('pl-PL') : '-';
}
function renderList(){
  var box = $('list'); box.innerHTML = '';
  if(!insts.length) box.appendChild(el('p','empty','Brak instalacji. Kliknij GRAJ!, a pojawi się tutaj.'));
  insts.forEach(function(i){
    var r = el('div','vi'); r.setAttribute('aria-current', i.id === slug());
    var t = el('div','t');
    t.appendChild(el('b','', i.name || ('Minecraft ' + i.version)));
    t.appendChild(el('small','', (i.loader === 'fabric' ? 'Fabric' : i.loader === 'quilt' ? 'Quilt' : 'Vanilla') + ' · ' + (i.ram||6) + ' GB · gra: ' + fmtT(i.playtime)));
    var g = el('button','btn pri','Graj');
    g.onclick = function(e){ e.stopPropagation(); choose(i); if(!busy) launch(); };
    var x = el('button','btn x','×');
    x.onclick = async function(e){ e.stopPropagation(); if(!confirm('Usunąć ' + (i.name || i.version) + '?')) return; try { await api.instDelete(i.id); await refresh(); } catch(err){ setStatus(err.message, true); } };
    r.appendChild(el('div','ico', i.version.length > 6 ? i.version.slice(0,6) : i.version));
    r.appendChild(t); r.appendChild(g); r.appendChild(x);
    r.onclick = function(){ choose(i); };
    box.appendChild(r);
  });
}
function choose(i){
  sel = { version: i.version, loader: i.loader };
  $('version').value = i.version;
  $('loader').value = i.loader;
  $('ram').value = i.ram || 6; $('ram-out').textContent = (i.ram||6) + ' GB';
  updateRamColor();
  if($('javaPath')) $('javaPath').value = i.javaPath || '';
  if($('jvmArgs')) $('jvmArgs').value = i.jvmArgs || '';
  if($('width')) $('width').value = i.width || 1280;
  if($('height')) $('height').value = i.height || 720;
  if($('fullscreen')) $('fullscreen').checked = !!i.fullscreen;
  if($('minimize')) $('minimize').checked = i.minimize !== false;
  renderList(); stats();
}
function updateRamColor(){
  var v = +$('ram').value;
  var out = $('ram-out');
  out.textContent = v + ' GB';
  if (v > 8) out.classList.add('warn'); else out.classList.remove('warn');
}
function fillVersions(){
  var list = versions.filter(v => $('snap').checked || v.type === 'release');
  if(!list.length) return;
  $('version').innerHTML = '';
  list.forEach(v => $('version').appendChild(new Option((v.type === 'snapshot' ? 'Snapshot ' : 'Minecraft ') + v.id, v.id)));
  if(!list.some(v => v.id === sel.version)) sel.version = list[0].id;
  $('version').value = sel.version;
}

$('snap').onchange = fillVersions;
$('version').onchange = function(e){ sel.version = e.target.value; var i = cur(); if(i) choose(i); else { renderList(); stats(); } };
$('loader').onchange = function(e){ sel.loader = e.target.value; var i = cur(); if(i) choose(i); else { renderList(); stats(); } };
var _ramT;
$('ram').oninput = function(e){
  updateRamColor();
  clearTimeout(_ramT);
  _ramT = setTimeout(async function(){
    var v = +$('ram').value || 6;
    try { if(cur()){ cur().ram = v; await api.instSave(cur()); } else { await upsert({ ram: v }); } } catch(err){ setStatus(err.message, true); }
  }, 300);
};
$('open-mods').onclick = async function(){ try { await upsert(); api.openSub(slug(),'mods'); } catch(e){ setStatus(e.message,true); } };
$('open-shots').onclick = async function(){ try { await upsert(); api.openSub(slug(),'screenshots'); } catch(e){ setStatus(e.message,true); } };

['javaPath','jvmArgs','width','height'].forEach(function(id){
  $(id).onchange = async function(){
    var v = (id === 'width' || id === 'height') ? (+$(id).value || 0) : $(id).value;
    try { if(cur()){ cur()[id] = v; await api.instSave(cur()); } else { var o = {}; o[id] = v; await upsert(o); } } catch(e){ setStatus(e.message,true); }
  };
});
['fullscreen','minimize'].forEach(function(id){
  $(id).onchange = async function(){
    try { if(cur()){ cur()[id] = $(id).checked; await api.instSave(cur()); } else { var o = {}; o[id] = $(id).checked; await upsert(o); } } catch(e){ setStatus(e.message,true); }
  };
});
document.querySelectorAll('[data-preset]').forEach(function(b){
  b.onclick = async function(){
    var v = JVM_PRESETS[b.dataset.preset] || '';
    $('jvmArgs').value = v;
    try { if(cur()){ cur().jvmArgs = v; await api.instSave(cur()); } else { await upsert({ jvmArgs: v }); } setStatus('Preset JVM: ' + b.dataset.preset); } catch(e){ setStatus(e.message,true); }
  };
});
$('pick-java').onclick = async function(){ try { var p = await api.pickJava(); if(p){ $('javaPath').value = p; if(cur()){ cur().javaPath = p; await api.instSave(cur()); } else { await upsert({ javaPath: p }); } setStatus('Java: ' + p); } } catch(e){ setStatus(e.message,true); } };
$('auto-java').onclick = async function(){ $('javaPath').value = ''; try { if(cur()){ cur().javaPath = ''; await api.instSave(cur()); } setStatus('Java: auto'); } catch(e){ setStatus(e.message,true); } };

async function launch(server){
  var acc = accounts.find(a => a.id === activeAcc);
  var nick = (acc && acc.nick) || S.nick;
  if(!validNick(nick)){ setStatus('Nick musi mieć 3-16 znaków.', true); $('nick').focus(); return; }
  if(busy) return;
  try {
    var i = await upsert({ ram: +$('ram').value || 6, server: server || '' });
    busy = true; $('play').disabled = true; $('play').textContent = 'URUCHAMIANIE...'; setStatus('Przygotowywanie gry...');
    await api.launch({ id: i.id, nick: nick, type: vtype(i.version) });
  } catch(e){ busy = false; $('play').disabled = false; $('play').textContent = 'GRAJ!'; setStatus('Błąd startu: ' + e.message, true); }
}
$('play').onclick = function(){ launch(); };
function done(){ busy = false; $('play').disabled = false; $('play').textContent = 'GRAJ!'; $('fill').style.width = '0'; }
api.onProgress(function(p){ if(p && p.total > 0 && typeof p.task === 'number'){ $('fill').style.width = Math.min(100, Math.round(p.task/p.total*100)) + '%'; if(p.type) setStatus('Pobieranie: ' + p.type + ' (' + p.task + '/' + p.total + ')'); } });
api.onStatus(function(t){ setStatus(t); if(t === 'Gra uruchomiona'){ $('fill').style.width = '100%'; $('play').textContent = 'GRA DZIAŁA'; } });
api.onLog(function(l){ addLog(l); });
api.onClosed(function(c){ done(); refresh(); setStatus(c === 0 ? 'Gra zamknięta.' : 'Kod ' + c + '. Sprawdź Logi.', c !== 0); });
api.onError(function(m){ done(); setStatus(m, true); });

Object.keys(COLORS).forEach(n => $('accent').appendChild(new Option(n, n)));
$('accent').onchange = function(e){ applyAccent(e.target.value); api.saveSettings({ accent: e.target.value }); };
$('manage').onclick = function(){ document.querySelector('.rb[data-v="instances"]').click(); };
$('addmods').onclick = function(){ document.querySelector('.tt button[data-r="mods"]').click(); $('q').focus(); };
$('nick').onchange = async function(e){
  var v = e.target.value.trim(); if(!validNick(v)) return;
  S.nick = v;
  var acc = accounts.find(a => a.id === activeAcc);
  if(acc){ acc.nick = v; accounts = await api.accountsSave({ id: activeAcc, nick: v }); }
  api.saveSettings({ nick: v });
  hero();
};

async function loadAccounts(){
  try { var r = await api.accountsList(); accounts = r.accounts || []; activeAcc = r.active || 'default'; }
  catch { accounts = [{ id: 'default', nick: 'Gracz' }]; activeAcc = 'default'; }
  var acc = accounts.find(a => a.id === activeAcc);
  if(acc) S.nick = acc.nick;
}
function loadAccountsView(){
  var box = $('acc-list'); box.innerHTML = '';
  accounts.forEach(function(a){
    var r = el('div','acc-bar');
    var av = el('div','avatar', (a.nick || '?').slice(0, 2).toUpperCase());
    var nm = el('div','nm');
    nm.appendChild(el('b','', a.nick));
    nm.appendChild(el('small','', a.id === activeAcc ? 'Aktywne' : 'Konto offline'));
    var sw = el('button','btn ' + (a.id === activeAcc ? 'pri' : ''), a.id === activeAcc ? 'Aktywne' : 'Przełącz');
    sw.disabled = a.id === activeAcc;
    sw.onclick = async function(){
      await api.accountsSwitch(a.id);
      activeAcc = a.id; S.nick = a.nick;
      await api.saveSettings({ nick: a.nick });
      loadAccountsView(); hero();
      setStatus('Przełączono na: ' + a.nick);
    };
    var ren = el('button','btn','Zmień nick');
    ren.onclick = async function(){
      var newNick = prompt('Nowy nick (3-16 znaków):', a.nick);
      if(!newNick || !validNick(newNick)) return;
      accounts = await api.accountsSave({ id: a.id, nick: newNick });
      if(a.id === activeAcc){ S.nick = newNick; await api.saveSettings({ nick: newNick }); }
      loadAccountsView(); hero();
      setStatus('Zmieniono nick: ' + newNick);
    };
    var del = el('button','btn x','×');
    del.onclick = async function(){
      if(!confirm('Usunąć konto ' + a.nick + '?')) return;
      var r2 = await api.accountsDelete(a.id);
      accounts = r2.accounts; activeAcc = r2.active;
      var acc = accounts.find(x => x.id === activeAcc);
      if(acc){ S.nick = acc.nick; await api.saveSettings({ nick: acc.nick }); }
      loadAccountsView(); hero();
    };
    r.appendChild(av); r.appendChild(nm); r.appendChild(sw); r.appendChild(ren); r.appendChild(del);
    box.appendChild(r);
  });
  if(!accounts.length) box.appendChild(el('p','empty','Brak kont.'));
}
$('acc-form').onsubmit = async function(e){
  e.preventDefault();
  var n = $('acc-nick').value.trim();
  if(!validNick(n)){ setStatus('Nick 3-16 znaków (litery, cyfry, _)', true); return; }
  try {
    accounts = await api.accountsSave({ nick: n });
    $('acc-nick').value = '';
    loadAccountsView();
    setStatus('Dodano konto: ' + n);
  } catch (err) {
    setStatus('Błąd dodawania: ' + err.message, true);
  }
};
$('acc-add').onclick = function(e){ e.preventDefault(); $('acc-form').onsubmit(e); };
$('acc-nick').onkeydown = function(e){ if(e.key === 'Enter'){ e.preventDefault(); $('acc-form').onsubmit(e); } };

async function loadInstancesView(){
  await refresh();
  var box = $('inst-grid'); box.innerHTML = '';
  if(!insts.length){ box.appendChild(el('p','empty','Brak instancji.')); return; }
  insts.forEach(function(i){
    var r = el('div','vi');
    r.appendChild(el('div','ico', i.version.length > 6 ? i.version.slice(0,6) : i.version));
    var t = el('div','t');
    t.appendChild(el('b','', i.name || ('Minecraft ' + i.version)));
    t.appendChild(el('small','', (i.loader === 'fabric' ? 'Fabric' : i.loader === 'quilt' ? 'Quilt' : 'Vanilla') + ' · ' + (i.ram||6) + ' GB · gra: ' + fmtT(i.playtime)));
    r.appendChild(t);
    var play = el('button','btn pri','Graj'); play.onclick = function(ev){ ev.stopPropagation(); choose(i); if(!busy) launch(); };
    var edit = el('button','btn','Edytuj'); edit.onclick = function(ev){ ev.stopPropagation(); openEditModal(i.id); };
    var upd = el('button','btn','Aktualizacje'); upd.onclick = async function(ev){ ev.stopPropagation(); try { await checkModUpdates(i.id); } catch(e){ setStatus(e.message, true); } };
    var clone = el('button','btn','Klonuj'); clone.onclick = async function(ev){ ev.stopPropagation(); try { await api.instClone(i.id); await refresh(); loadInstancesView(); setStatus('Sklonowano'); } catch(e){ setStatus(e.message,true); } };
    var backup = el('button','btn','Backup'); backup.onclick = async function(ev){ ev.stopPropagation(); try { await api.instBackup(i.id); setStatus('Backup zapisany'); } catch(e){ setStatus(e.message,true); } };
    var open = el('button','btn','Folder'); open.onclick = function(ev){ ev.stopPropagation(); api.instOpen(i.id); };
    var del = el('button','btn x','×'); del.onclick = async function(ev){ ev.stopPropagation(); if(!confirm('Usunąć ' + (i.name || i.version) + '?')) return; try { await api.instDelete(i.id); await refresh(); loadInstancesView(); } catch(e){ setStatus(e.message,true); } };
    r.appendChild(play); r.appendChild(edit); r.appendChild(upd); r.appendChild(clone); r.appendChild(backup); r.appendChild(open); r.appendChild(del);
    r.onclick = function(){ choose(i); };
    box.appendChild(r);
  });
}
function openEditModal(id){
  var inst = insts.find(x => x.id === id); if(!inst) return;
  $('modal-title').textContent = 'Edytuj: ' + (inst.name || inst.version);
  $('me-name').value = inst.name || inst.version;
  $('me-account').innerHTML = '';
  $('me-account').appendChild(new Option('(aktywne konto)', ''));
  accounts.forEach(a => $('me-account').appendChild(new Option(a.nick, a.id)));
  $('me-account').value = inst.account || '';
  $('me-ram').value = inst.ram || 6;
  $('me-java').value = inst.javaPath || '';
  $('me-jvm').value = inst.jvmArgs || '';
  $('me-w').value = inst.width || 1280;
  $('me-h').value = inst.height || 720;
  $('me-full').checked = !!inst.fullscreen;
  $('me-min').checked = inst.minimize !== false;
  $('modal-edit').dataset.id = id;
  $('modal-edit').removeAttribute('hidden');
}
$('modal-save').onclick = async function(){
  var id = $('modal-edit').dataset.id;
  var patch = {
    name: $('me-name').value.trim() || id,
    account: $('me-account').value || '',
    ram: +$('me-ram').value || 6,
    javaPath: $('me-java').value.trim(),
    jvmArgs: $('me-jvm').value.trim(),
    width: +$('me-w').value || 1280,
    height: +$('me-h').value || 720,
    fullscreen: $('me-full').checked,
    minimize: $('me-min').checked
  };
  try { await api.instUpdate(id, patch); $('modal-edit').setAttribute('hidden',''); await refresh(); loadInstancesView(); setStatus('Zapisano: ' + patch.name); }
  catch(e){ setStatus('Błąd: ' + e.message, true); }
};
$('modal-cancel').onclick = function(){ $('modal-edit').setAttribute('hidden',''); };
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    $('modal-edit').setAttribute('hidden','');
    $('modal-backups').setAttribute('hidden','');
    $('modal-updates').setAttribute('hidden','');
  }
});
$('inst-import').onclick = async function(){ try { var r = await api.instImport(); if(r){ await refresh(); loadInstancesView(); setStatus('Zaimportowano'); } } catch(e){ setStatus(e.message,true); } };
$('inst-new').onclick = async function(){ try { await upsert(); await refresh(); loadInstancesView(); setStatus('Nowa instancja'); } catch(e){ setStatus(e.message,true); } };

$('open-backups').onclick = async function(){ await showBackups(); };
async function showBackups(){
  var box = $('backups-list'); box.innerHTML = '';
  try {
    var list = await api.backupsList();
    if(!list.length){ box.appendChild(el('p','empty','Brak backupów.')); }
    list.forEach(function(b){
      var r = el('div','bk-row');
      var nm = el('div','nm');
      nm.appendChild(el('b','', b.name));
      nm.appendChild(el('small','', fmtSize(b.size) + ' · ' + new Date(b.mtime).toLocaleString('pl-PL')));
      var res = el('button','btn','Przywróć');
      res.onclick = async function(){
        if(!confirm('Przywrócić backup jako nową instancję?')) return;
        try { await api.backupsRestore(b.path); await refresh(); loadInstancesView(); showBackups(); setStatus('Przywrócono'); }
        catch(e){ setStatus(e.message,true); }
      };
      var del = el('button','btn x','×');
      del.onclick = async function(){
        if(!confirm('Usunąć backup?')) return;
        try { await api.backupsDelete(b.path); showBackups(); } catch(e){ setStatus(e.message,true); }
      };
      r.appendChild(nm); r.appendChild(res); r.appendChild(del);
      box.appendChild(r);
    });
  } catch(e){ box.innerHTML = ''; box.appendChild(el('p','empty','Błąd: ' + e.message)); }
  $('modal-backups').removeAttribute('hidden');
}
$('backups-close').onclick = function(){ $('modal-backups').setAttribute('hidden',''); };
$('backups-open-folder').onclick = function(){ api.backupsOpen(); };

async function checkModUpdates(id){
  setStatus('Sprawdzanie aktualizacji...');
  var updates = await api.modsCheckUpdates(id);
  if(!updates.length){ setStatus('Wszystkie mody aktualne'); return; }
  var box = $('updates-list'); box.innerHTML = '';
  updates.forEach(function(u){
    var r = el('div','bk-row');
    var nm = el('div','nm');
    nm.appendChild(el('b','', u.projectTitle || u.project));
    nm.appendChild(el('small','', u.current + ' → ' + u.latestVersion));
    r.appendChild(nm);
    box.appendChild(r);
  });
  $('modal-updates').dataset.inst = id;
  $('modal-updates').dataset.updates = JSON.stringify(updates);
  $('modal-updates').removeAttribute('hidden');
}
$('updates-close').onclick = function(){ $('modal-updates').setAttribute('hidden',''); };
$('updates-apply').onclick = async function(){
  var id = $('modal-updates').dataset.inst;
  var updates = JSON.parse($('modal-updates').dataset.updates || '[]');
  if(!updates.length) return;
  try { setStatus('Aktualizowanie...'); await api.modsApplyUpdates(id, updates); $('modal-updates').setAttribute('hidden',''); setStatus('Zaktualizowano'); }
  catch(e){ setStatus(e.message, true); }
};

async function loadWorldsView(){
  await refresh();
  var sel2 = $('worlds-inst'); sel2.innerHTML = '';
  if(!insts.length){ sel2.appendChild(new Option('(brak instancji)', '')); $('worlds-list').innerHTML = '<p class="empty">Brak instancji.</p>'; return; }
  insts.forEach(i => sel2.appendChild(new Option(i.name || ('Minecraft ' + i.version), i.id)));
  sel2.value = insts.some(i => i.id === slug()) ? slug() : insts[0].id;
  await renderWorlds();
}
async function renderWorlds(){
  var instId = $('worlds-inst').value;
  var box = $('worlds-list'); box.innerHTML = '';
  if(!instId) return;
  try {
    var worlds = await api.worldsList(instId);
    if(!worlds.length){ box.appendChild(el('p','empty','Brak światów.')); return; }
    worlds.forEach(function(w){
      var r = el('div','wb-wrap');
      var ic = el('div','wb-ic');
      if(w.icon){ var img = el('img'); img.src = w.icon; ic.appendChild(img); } else ic.textContent = 'MC';
      var info = el('div','wb-info');
      info.appendChild(el('b','', w.name));
      info.appendChild(el('small','', new Date(w.mtime).toLocaleString('pl-PL')));
      var acts = el('div','wb-actions');
      var open = el('button','btn','Folder'); open.onclick = function(){ api.openSub(instId, 'saves'); };
      var bk = el('button','btn','Backup'); bk.onclick = async function(){ try { await api.worldsBackup(instId, w.name); setStatus('Backup: ' + w.name); } catch(e){ setStatus(e.message,true); } };
      var del = el('button','btn x','×'); del.onclick = async function(){ if(!confirm('Usunąć świat?')) return; try { await api.worldsDelete(instId, w.name); renderWorlds(); } catch(e){ setStatus(e.message,true); } };
      acts.appendChild(open); acts.appendChild(bk); acts.appendChild(del);
      r.appendChild(ic); r.appendChild(info); r.appendChild(acts);
      box.appendChild(r);
    });
  } catch(e){ box.innerHTML = ''; box.appendChild(el('p','empty','Błąd: ' + e.message)); }
}
$('worlds-inst').onchange = renderWorlds;
$('worlds-open').onclick = function(){ if($('worlds-inst').value) api.openSub($('worlds-inst').value, 'saves'); };

async function loadHomeWorlds(){
  var box = $('home-worlds'); box.innerHTML = '';
  if(!insts.length){ box.innerHTML = '<p class="empty">Brak instancji.</p>'; return; }
  var allWorlds = [];
  for(var i = 0; i < Math.min(insts.length, 4); i++){
    try { var ws = await api.worldsList(insts[i].id); ws.slice(0, 2).forEach(w => allWorlds.push({ inst: insts[i], world: w })); } catch {}
  }
  allWorlds.sort((a,b) => b.world.mtime - a.world.mtime);
  var top = allWorlds.slice(0, 5);
  if(!top.length){ box.innerHTML = '<p class="empty">Brak światów.</p>'; return; }
  top.forEach(function(x){
    var r = el('div','wl-row');
    if(x.world.icon){ var im = el('img'); im.src = x.world.icon; r.appendChild(im); } else r.appendChild(el('div','ico', x.inst.version.slice(0, 3)));
    var nm = el('div','nm');
    nm.appendChild(el('b','', x.world.name));
    nm.appendChild(el('small','', x.inst.name + ' · ' + new Date(x.world.mtime).toLocaleDateString('pl-PL')));
    r.appendChild(nm);
    var play = el('button','btn pri','Graj');
    play.onclick = function(e){ e.stopPropagation(); choose(x.inst); if(!busy) launch(); };
    r.appendChild(play);
    box.appendChild(r);
  });
}

async function loadShotsView(){
  await refresh();
  var sel2 = $('shots-inst'); sel2.innerHTML = '';
  if(!insts.length){ sel2.appendChild(new Option('(brak instancji)', '')); $('shots-grid').innerHTML = '<p class="empty" style="grid-column:1/-1">Brak instancji.</p>'; return; }
  insts.forEach(i => sel2.appendChild(new Option(i.name || ('Minecraft ' + i.version), i.id)));
  sel2.value = insts.some(i => i.id === slug()) ? slug() : insts[0].id;
  await renderShots();
}
async function renderShots(){
  var instId = $('shots-inst').value;
  var box = $('shots-grid'); box.innerHTML = '';
  if(!instId) return;
  try {
    var shots = await api.shotsList(instId);
    if(!shots.length){ box.innerHTML = '<p class="empty" style="grid-column:1/-1">Brak zrzutów.</p>'; return; }
    shots.forEach(function(s){
      var d = el('div','shot');
      var img = el('img'); img.src = s.url; img.alt = s.name;
      var del = el('button','del','×');
      del.onclick = async function(e){ e.stopPropagation(); if(!confirm('Usunąć?')) return; try { await api.shotsDelete(instId, s.name); renderShots(); } catch(e){ setStatus(e.message,true); } };
      d.appendChild(img); d.appendChild(del);
      d.onclick = function(){ api.shotsOpen(instId, s.name); };
      box.appendChild(d);
    });
  } catch(e){ box.innerHTML = ''; box.appendChild(el('p','empty','Błąd: ' + e.message)); }
}
$('shots-inst').onchange = renderShots;
$('shots-open').onclick = function(){ if($('shots-inst').value) api.openSub($('shots-inst').value, 'screenshots'); };

function loadSkinsView(){
  var n = encodeURIComponent(S.nick || 'Steve');
  var t = Date.now();
  $('skin-head').src = 'https://minotar.net/helm/' + n + '/128.png?t=' + t;
  $('skin-body').src = 'https://minotar.net/armor/body/' + n + '/100.png?t=' + t;
  $('skin-full').src = 'https://minotar.net/skin/' + n + '?t=' + t;
}
$('skin-refresh').onclick = loadSkinsView;
$('skin-download').onclick = function(){ api.openUrl('https://minotar.net/skin/' + encodeURIComponent(S.nick || 'Steve')); };

async function loadStatsView(){
  await refresh();
  var total2 = insts.reduce((a, i) => a + (i.playtime || 0), 0);
  var sorted = insts.slice().sort((a, b) => (b.playtime || 0) - (a.playtime || 0));
  var grid = $('stats-grid'); grid.innerHTML = '';
  var card = function(label, val){ var c = el('div','stat-card'); c.appendChild(el('b','', val)); c.appendChild(el('small','', label)); return c; };
  grid.appendChild(card('Łączny czas', fmtT(total2)));
  grid.appendChild(card('Instancji', String(insts.length)));
  grid.appendChild(card('Najczęściej grana', sorted[0] ? (sorted[0].name || sorted[0].version) : '—'));
  grid.appendChild(card('Ostatnio grana', sorted[0] && sorted[0].lastPlayed ? new Date(sorted[0].lastPlayed).toLocaleDateString('pl-PL') : '—'));
  var per = $('stats-per'); per.innerHTML = '';
  if(!insts.length){ per.appendChild(el('p','empty','Brak instancji.')); return; }
  var maxPt = Math.max.apply(null, insts.map(i => i.playtime || 0)) || 1;
  sorted.forEach(function(i){
    var r = el('div','vi');
    r.appendChild(el('div','ico', i.version.slice(0, 6)));
    var t = el('div','t');
    t.appendChild(el('b','', i.name || ('Minecraft ' + i.version)));
    t.appendChild(el('small','', fmtT(i.playtime) + ' · ' + (i.loader === 'fabric' ? 'Fabric' : i.loader === 'quilt' ? 'Quilt' : 'Vanilla')));
    var bar = el('div','bar'); var fill = el('i'); fill.style.width = Math.round((i.playtime || 0) / maxPt * 100) + '%'; bar.appendChild(fill);
    t.appendChild(bar); r.appendChild(t); per.appendChild(r);
  });
}

function addLog(line){
  var text = String(line || '').trim(); if(!text) return;
  logsAll.push({ text: text, type: classifyLog(text) });
  if(logsAll.length > 5000) logsAll = logsAll.slice(-3000);
  renderLogs();
}
function renderLogs(){
  var e = $('log');
  var filtered = logFilter === 'all' ? logsAll : logsAll.filter(l => l.type === logFilter);
  e.textContent = filtered.map(l => l.text).join('\n');
  e.scrollTop = e.scrollHeight;
}
document.querySelectorAll('[data-logfilter]').forEach(function(b){
  b.onclick = function(){
    logFilter = b.dataset.logfilter;
    document.querySelectorAll('[data-logfilter]').forEach(x => x.style.borderColor = '');
    b.style.borderColor = 'var(--accent)';
    renderLogs();
  };
});
$('log-clear').onclick = function(){ logsAll = []; renderLogs(); };
$('log-save').onclick = async function(){ try { var ok = await api.logSave(logsAll.map(l => l.text).join('\n')); if(ok) setStatus('Zapisano log'); } catch(e){ setStatus(e.message,true); } };
$('log-copy').onclick = function(){ navigator.clipboard.writeText(logsAll.map(l => l.text).join('\n')); setStatus('Skopiowano'); };
$('log-analyze').onclick = async function(){
  var box = $('crash-result'); box.innerHTML = '<p class="sub">Analizowanie...</p>';
  try {
    var instId = cur() ? cur().id : (insts[0] && insts[0].id);
    if(!instId){ box.innerHTML = '<p class="sub">Brak instancji.</p>'; return; }
    var r = await api.crashAnalyze(instId);
    box.innerHTML = '';
    if(!r.ok){ box.innerHTML = ''; box.appendChild(el('p','sub', r.message)); return; }
    if(!r.errors.length){ box.appendChild(el('p','sub', r.summary)); }
    else {
      r.errors.forEach(function(err){
        var d = el('div','crash-box' + (err.type === 'warn' ? ' warn' : ''));
        d.appendChild(el('b','', (err.type === 'warn' ? 'Uwaga: ' : 'Błąd: ') + err.title));
        d.appendChild(el('small','', 'Rozwiązanie: ' + err.fix));
        if(err.context) d.appendChild(el('pre','', err.context));
        box.appendChild(d);
      });
    }
    if(r.tail){ var t = el('div','crash-box'); t.appendChild(el('b','','Ostatnie linie')); t.appendChild(el('pre','', r.tail)); box.appendChild(t); }
  } catch(e){ box.innerHTML = ''; box.appendChild(el('p','sub','Błąd analizy: ' + e.message)); }
};

async function renderServers(){
  var box = $('servers'); box.innerHTML = '';
  var list = S.servers || [];
  if(!list.length) box.appendChild(el('p','empty','Brak serwerów.'));
  list.forEach(function(s, n){
    var hsh = 0; for(var k = 0; k < s.length; k++) hsh = (hsh * 31 + s.charCodeAt(k)) % 360;
    var c = el('div','srvc');
    var bn = el('div','bn', s.split(':')[0].toUpperCase());
    bn.style.background = 'linear-gradient(135deg,hsl(' + hsh + ' 65% 42%),hsl(' + ((hsh+50)%360) + ' 70% 26%))';
    var dot = el('span','dot');
    bn.appendChild(dot);
    var inn = el('div','in');
    var code = el('code','', s);
    var motd = el('div','motd','Sprawdzanie...');
    var r = el('div','row');
    var a = el('button','btn w','Kopiuj');
    var j = el('button','btn pri w','Dołącz');
    var d = el('button','btn x','×');
    a.onclick = function(){ navigator.clipboard.writeText(s); a.textContent = 'OK'; setTimeout(() => a.textContent = 'Kopiuj', 1200); };
    j.onclick = function(){ if(!busy) launch(s); };
    d.onclick = function(){ S.servers.splice(n, 1); api.saveSettings({ servers: S.servers }); renderServers(); };
    r.appendChild(a); r.appendChild(j); r.appendChild(d);
    inn.appendChild(code); inn.appendChild(motd); inn.appendChild(r);
    c.appendChild(bn); c.appendChild(inn); box.appendChild(c);
    api.srvPing(s).then(function(p){
      if(p && p.online){
        dot.classList.add('online');
        motd.textContent = (p.players ? p.players.online + '/' + p.players.max + ' graczy' : 'Online') + (p.version ? ' · ' + p.version : '');
        if(p.icon){ var im = el('img'); im.src = p.icon; bn.innerHTML = ''; bn.appendChild(im); bn.appendChild(dot); dot.classList.add('online'); }
      } else { dot.classList.add('offline'); motd.textContent = 'Offline'; }
    });
  });
}
$('srv-add').onclick = function(){ var v = $('srv-ip').value.trim(); if(!v) return; S.servers = (S.servers || []).concat(v); api.saveSettings({ servers: S.servers }); $('srv-ip').value = ''; renderServers(); };
$('srv-ip').onkeydown = function(e){ if(e.key === 'Enter') $('srv-add').click(); };

async function search(more){
  var box = $('res');
  if(!more){ offset = 0; box.innerHTML = ''; box.appendChild(el('p','empty','Szukanie...')); }
  try {
    var r = await api.mrSearch({ q: $('q').value.trim(), version: sel.version, loader: sel.loader, type: $('type').value, sort: $('sort').value, offset: offset, compat: $('compat').checked });
    if(!more) box.innerHTML = '';
    total = r.total; offset += r.hits.length;
    $('count').textContent = 'Wyniki: ' + offset + ' z ' + total.toLocaleString('pl-PL');
    $('more').style.display = offset < total ? 'block' : 'none';
    if(!r.hits.length && !more) box.appendChild(el('p','empty','Nic nie znaleziono.'));
    var isModpack = $('type').value === 'modpack';
    r.hits.forEach(function(h){
      var c = el('div','card');
      var im = el('img'); if(h.icon) im.src = h.icon;
      var t = el('div','t');
      t.appendChild(el('b','', h.title));
      t.appendChild(el('span','', h.desc));
      t.appendChild(el('span','', 'autor: ' + h.author + ' · ' + h.downloads.toLocaleString('pl-PL') + ' pobrań'));
      var b = el('button','btn pri', isModpack ? 'Zainstaluj' : 'Pobierz');
      b.onclick = async function(){
        if(!isModpack && $('type').value === 'mod' && sel.loader === 'vanilla'){ setStatus('Mody wymagają Fabrica/Quilt.', true); return; }
        b.disabled = true; b.textContent = '...';
        try {
          if(isModpack){
            var vs = await fetch('https://api.modrinth.com/v2/project/' + h.id + '/version?game_versions=' + encodeURIComponent(JSON.stringify([sel.version]))).then(r => r.json());
            if(!vs.length) throw new Error('Brak wersji dla MC ' + sel.version);
            await api.modpackInstall({ project: h.id, versionId: vs[0].id, gameVersion: sel.version, loader: sel.loader });
            await refresh(); loadInstancesView(); b.textContent = 'Zainstalowano';
            setStatus('Modpack: ' + h.title);
          } else {
            await upsert();
            await api.mrInstall({ inst: slug(), project: h.id, projectTitle: h.title, version: sel.version, loader: sel.loader, type: $('type').value });
            b.textContent = 'Gotowe'; setStatus('Pobrano: ' + h.title);
          }
        } catch(e){ b.disabled = false; b.textContent = isModpack ? 'Zainstaluj' : 'Pobierz'; setStatus(e.message, true); }
      };
      c.appendChild(im); c.appendChild(t); c.appendChild(b); box.appendChild(c);
    });
  } catch(e){ box.innerHTML = ''; box.appendChild(el('p','empty','Błąd: ' + e.message)); }
}
$('search').onclick = function(){ search(false); };
$('more').onclick = function(){ search(true); };
$('q').onkeydown = function(e){ if(e.key === 'Enter') search(false); };
['type','sort','compat'].forEach(id => $(id).onchange = function(){ offset = 0; search(false); });

document.querySelectorAll('[data-url]').forEach(b => b.onclick = function(){ api.openUrl(b.dataset.url); });
$('reset-settings').onclick = async function(){
  if(!confirm('Zresetować ustawienia?')) return;
  try {
    var d = await api.settingsReset();
    S = Object.assign({}, S, d);
    await loadAccounts();
    $('nick').value = S.nick || 'Gracz';
    if(COLORS[S.accent]){ $('accent').value = S.accent; applyAccent(S.accent); }
    renderServers(); loadAccountsView(); setStatus('Zresetowano');
  } catch(e){ setStatus(e.message, true); }
};

(async function(){
  try {
    var info = await api.init();
    S = info.settings || {};
    var totalRam = info.totalRam || 16;
    $('ram').max = Math.min(16, Math.max(2, totalRam - 2));  // zostaw 2 GB dla systemu
    if (+$('ram').value > $('ram').max) $('ram').value = Math.max(4, $('ram').max - 2);
    updateRamColor();
    if(!COLORS[S.accent]) S.accent = 'Lapis';
    $('accent').value = S.accent; applyAccent(S.accent);
    await loadAccounts();
    $('nick').value = S.nick || 'Gracz';
    renderServers();
    versions = await api.getVersions();
    fillVersions();
    await refresh();
    var last = insts.find(x => x.id === S.last) || insts[0];
    if(last) choose(last);
    loadAccountsView();
    loadHomeWorlds();
    search(false);
  } catch(e){ console.error(e); setStatus('Błąd inicjalizacji: ' + e.message, true); }
})();
$('acc-form').addEventListener('submit', function(e){ e.preventDefault(); });
