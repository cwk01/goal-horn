// Control page.
const $ = id => document.getElementById(id);
const { LEAGUES, teams } = window.GoalHornTeams;
const desktop = !!window.goalHornDesktop;
const onThisComputer = ['localhost', '127.0.0.1'].includes(location.hostname);

let S = null;                 // server state
let live = null;              // live channel
let pickLeague = 'NHL';
let soundingTimer = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3500);
}
const playBrowser = () => localStorage.getItem('gh.playBrowser') === '1';
const playsHere = () => (desktop ? S && S.settings.playHere : playBrowser());
const myRole = () => (desktop ? 'local' : playBrowser() ? 'speaker' : 'control');
const myName = () => (desktop ? 'This computer' : 'Browser on ' + (navigator.platform || 'this device'));

function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

// ── State and theme ──────────────────────────────────────────────────────────
function applyState(state) {
  S = state;
  const lg = S.league, team = S.team;
  applyTeamColor(team);
  $('teamName').firstChild.textContent = team ? team.name : 'Goal Horn';
  $('leagueLine').textContent = S.settings.league + ' ' + lg.horn.toLowerCase() + ' horn';
  document.title = (team ? team.name + ' ' : '') + lg.horn + ' Horn';
  $('horn').textContent = lg.button;
  $('goalLabel').textContent = lg.horn + ' horn';
  $('autoGoal').checked = S.settings.autoGoal;
  $('autoWin').checked = S.settings.autoWin;
  $('playHere').checked = S.settings.playHere;
  $('playBrowser').checked = playBrowser();
  $('delay').value = S.settings.delay; $('delayVal').textContent = S.settings.delay;
  $('volume').value = S.settings.volume; $('volumeVal').textContent = S.settings.volume;
  if (document.activeElement !== $('libraryUrl')) $('libraryUrl').value = S.settings.libraryUrl;
  $('versionLine').textContent = 'Goal Horn ' + S.version;
  $('playHereRow').classList.toggle('hidden', !(desktop || S.headless));
  $('playBrowserRow').classList.toggle('hidden', desktop);
  $('editorField').classList.toggle('hidden', !onThisComputer);
  if (S.headless && S.soundCard === false) $('playHereRow').title = 'No audio player found. Install mpg123.';
  renderHorns(S.horns);
  renderSpeakers(S.speakers);
  $('speakerUrl').textContent = S.speakerUrls[0] || 'No network connection found. Connect this computer to Wi-Fi or a network cable.';
  pickLeague = S.settings.league;
  renderPicker('leaguePick', 'teamSearch', 'teamList', S.settings.team, saveTeam);
  if (!S.settings.setupDone && onThisComputer) openWelcome();
}

function renderHorns(h) {
  if (S) S.horns = h;
  const text = {
    upload: 'Your file',
    library: 'Downloaded for ' + (S && S.team ? S.team.name : 'your team'),
    generic: 'Downloaded default for ' + (S ? S.league.sport : 'this sport'),
    'built-in': 'Built-in horn (no team horn found)',
  };
  for (const t of ['goal', 'win']) {
    const el = $(t + 'Src'); el.textContent = text[h[t].source] || h[t].source;
    if (h[t].source === 'upload') {
      const a = document.createElement('button');
      a.type = 'button'; a.className = 'btn quiet'; a.style.padding = '0 6px'; a.textContent = 'Remove';
      a.onclick = async () => applyState(await api('/api/horns/clear?type=' + t, { method: 'POST' }));
      el.append(' ', a);
    }
  }
  if (playsHere()) for (const t of ['goal', 'win']) Horn.load(t, h[t].src).catch(() => {});
}

// ── Team picker (used in settings and the welcome screen) ───────────────────
function renderPicker(pillsId, searchId, listId, selected, onPick) {
  const pills = $(pillsId), list = $(listId), search = $(searchId);
  pills.innerHTML = Object.keys(LEAGUES).map(l => `<button type="button" aria-pressed="${l === pickLeague}" data-l="${l}">${l}</button>`).join('');
  pills.onclick = e => { const b = e.target.closest('button'); if (!b) return; pickLeague = b.dataset.l; search.value = ''; renderPicker(pillsId, searchId, listId, selected, onPick); };
  const q = search.value.trim().toLowerCase();
  const rows = teams[pickLeague].filter(t => !q || t.name.toLowerCase().includes(q) || t.abbrev.toLowerCase().includes(q));
  const isSel = t => S && pickLeague === S.settings.league && t.abbrev === selected;
  list.innerHTML = rows.map(t => `<button type="button" role="option" aria-selected="${isSel(t)}" data-a="${t.abbrev}"><span class="chip" style="background:${t.primary}"></span>${esc(t.name)}</button>`).join('')
    || '<p class="muted" style="padding:10px 12px;margin:0">No team matches that search.</p>';
  list.onclick = e => { const b = e.target.closest('button'); if (b) onPick(pickLeague, b.dataset.a); };
  search.oninput = () => renderPicker(pillsId, searchId, listId, selected, onPick);
}

async function saveTeam(league, team) {
  applyState(await api('/api/settings', { body: { league, team } }));
  toast('Following the ' + window.GoalHornTeams.findTeam(league, team).name);
  pollGame();
}

async function saveSetting(patch) {
  try { applyState(await api('/api/settings', { body: patch })); } catch (e) { toast(e.message); }
}

// ── Welcome ──────────────────────────────────────────────────────────────────
let welcomePick = null;
function openWelcome() {
  if (!$('welcome').classList.contains('hidden')) return;
  $('welcome').classList.remove('hidden');
  const draw = () => renderPicker('wLeaguePick', 'wTeamSearch', 'wTeamList', welcomePick && welcomePick.team, (league, team) => {
    welcomePick = { league, team };
    $('wDone').disabled = false;
    $('wDone').textContent = 'Start with the ' + window.GoalHornTeams.findTeam(league, team).name;
    [...$('wTeamList').children].forEach(b => b.setAttribute('aria-selected', b.dataset && b.dataset.a === team));
  });
  draw();
  $('wDone').onclick = async () => {
    applyState(await api('/api/settings', { body: { ...welcomePick, setupDone: true } }));
    $('welcome').classList.add('hidden');
    pollGame();
  };
}

// ── Horn ─────────────────────────────────────────────────────────────────────
function setSounding(on, seconds = 8) {
  clearTimeout(soundingTimer);
  $('horn').classList.toggle('sounding', on);
  $('stopBtn').disabled = !on;
  if (on) soundingTimer = setTimeout(() => setSounding(false), seconds * 1000);
}

Horn.onplay = (type, duration) => setSounding(true, duration + 0.3);
Horn.onend = () => setSounding(false);

async function fire(type) {
  if (playsHere()) Horn.unlock().catch(() => {});
  try { await api('/api/horn', { body: { type } }); } catch (e) { toast(e.message); }
}

function onPlay(d) {
  setSounding(true);
  const listening = (S ? S.speakers : []).filter(s => s.ready).length;
  const by = d.origin === 'auto' ? 'Your team scored. ' : '';
  $('hornNote').textContent = by + (listening ? 'Playing on ' + plural(listening, 'speaker') + '.' : 'No speakers are on. Open Speakers to add one.');
  if (playsHere()) Horn.play(d.type, d.src, (d.volume || 100) / 100 * speakerVolume()).catch(e => toast(e.message));
}
const speakerVolume = () => (desktop ? 1 : Number(localStorage.getItem('gh.myVolume') || 100) / 100);

function renderSpeakers(list) {
  if (S) S.speakers = list;
  const ready = list.filter(s => s.ready);
  $('speakerCount').textContent = ready.length;
  $('speakerList').innerHTML = list.length ? list.map(s => `<li><div><strong>${esc(s.name)}</strong><div class="waiting">${s.ready ? 'Ready' : 'Waiting for someone to tap "Turn on sound"'}</div></div><button class="btn" type="button" data-test="${s.id}">Test</button></li>`).join('')
    : '<li><span class="muted">Nothing connected yet. Scan the code above on a phone or TV to add one.</span></li>';
}

// ── Scoreboard ───────────────────────────────────────────────────────────────
function side(el, t, mine) {
  el.classList.toggle('mine', mine);
  const img = el.querySelector('img'); if (t.logo) { img.src = t.logo; img.alt = t.name || t.abbrev; }
  el.querySelector('.abbr').textContent = t.abbrev || '';
  el.querySelector('.score').textContent = t.score ?? 0;
}

function tallies(list) {
  const n = {}, out = new Map();
  for (const g of list) {
    const k = g.playerId || g.text; if (!k) continue;
    n[k] = (n[k] || 0) + 1; out.set(g, n[k]);
  }
  return out;
}

function renderScoring(game) {
  const box = $('scoring');
  if (!game || !game.scoring || !game.scoring.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const myAbbr = S.settings.team;
  const unit = LEAGUES[game.league].unit;
  const hockey = LEAGUES[game.league].sport === 'hockey';
  const tally = hockey ? tallies(game.scoring) : new Map();
  for (const [id, t] of [['awayScoring', game.away], ['homeScoring', game.home]]) {
    const col = $(id);
    col.classList.toggle('mine', t.abbrev === myAbbr);
    col.querySelector('h2').textContent = t.abbrev + ' ' + unit.toLowerCase();
    const plays = game.scoring.filter(g => g.team === t.abbrev).reverse();
    col.querySelector('ol').innerHTML = plays.length ? plays.map(g => {
      const n = tally.get(g) || 0;
      const tag = n > 1 ? `<span class="tag tally">${n === 3 ? 'Hat trick' : '#' + n}</span>` : '';
      const badge = g.badge ? `<span class="tag ${esc(g.badge)}">${esc(g.badge.toUpperCase())}</span>` : '';
      return `<li><div class="who">${esc(g.text)}</div><div class="when">${esc([g.periodLabel, g.time].filter(Boolean).join(', '))}${badge}${tag}</div></li>`;
    }).join('') : '<li class="muted">None yet</li>';
  }
}

let countdownTarget = null;
function tickCountdown() {
  if (!countdownTarget) return;
  const ms = countdownTarget - Date.now();
  if (ms <= 0) { $('countdown').textContent = 'Starting now'; return; }
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  $('countdown').textContent = 'Starts in ' + (d ? plural(d, 'day') + ', ' : '') + (d || h ? plural(h, 'hour') + ', ' : '') + plural(m, 'minute') + (d ? '' : ', ' + plural(s, 'second'));
}
setInterval(tickCountdown, 1000);

function renderNext(g) {
  $('next').classList.remove('hidden');
  if (g.away.logo) $('nextAway').src = g.away.logo;
  if (g.home.logo) $('nextHome').src = g.home.logo;
  $('nextAway').alt = g.away.name || ''; $('nextHome').alt = g.home.name || '';
  if (g.start) {
    const d = new Date(g.start);
    $('nextWhen').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    countdownTarget = d.getTime(); tickCountdown();
  } else { $('nextWhen').textContent = g.dateText || ''; countdownTarget = null; $('countdown').textContent = ''; }
  $('nextVenue').textContent = (g.away.name || g.away.abbrev) + ' at ' + (g.home.name || g.home.abbrev) + (g.venue ? ', ' + g.venue : '');
}

function renderGame(data) {
  const g = data.game, myAbbr = S.settings.team;
  const notice = $('notice');
  notice.classList.remove('error');
  $('board').classList.add('hidden'); $('next').classList.add('hidden');
  if (g && g.state !== 'FUT') {
    notice.classList.add('hidden');
    $('board').classList.remove('hidden');
    side($('away'), g.away, g.away.abbrev === myAbbr);
    side($('home'), g.home, g.home.abbrev === myAbbr);
    const now = $('statusNow');
    now.textContent = g.state === 'LIVE' ? (g.status || 'Live') : g.status;
    now.classList.toggle('live', g.state === 'LIVE' && !g.intermission);
    $('statusSub').textContent = g.state === 'LIVE' ? (data.delay ? 'Live, shown ' + data.delay + ' seconds behind to match TV' : 'Live') : (g.venue || '');
    const cur = g.periods.length ? Math.min(g.period, g.periods.length) : 0;
    $('pips').innerHTML = g.state === 'LIVE' ? g.periods.map((p, i) => `<span class="pip ${i + 1 < cur ? 'past' : i + 1 === cur ? 'cur' : ''}">${esc(p)}</span>`).join('') : '';
    const sit = $('situation');
    if (g.situation) {
      sit.classList.remove('hidden');
      sit.innerHTML = (g.situation.possession ? `<span class="ball">${esc(g.situation.possession)} ball</span>, ` : '') + esc(g.situation.text)
        + (g.situation.redZone ? '<span class="rz">Red zone</span>' : '')
        + (g.situation.lastPlay ? `<span class="last">${esc(g.situation.lastPlay)}</span>` : '');
    } else sit.classList.add('hidden');
    renderScoring(g);
    return;
  }
  renderScoring(null);
  const upcoming = g && g.state === 'FUT' ? g : data.next;
  if (upcoming) { notice.classList.add('hidden'); renderNext(upcoming); return; }
  notice.classList.remove('hidden');
  if (data.error) { notice.classList.add('error'); notice.textContent = 'Could not reach the ' + S.settings.league + ' schedule. Trying again shortly.'; }
  else notice.textContent = 'No upcoming games found for the ' + (S.team ? S.team.name : 'selected team') + '.';
}

async function pollGame() {
  try { renderGame(await api('/api/game')); }
  catch (e) { const n = $('notice'); n.classList.remove('hidden'); n.classList.add('error'); n.textContent = 'Goal Horn is not responding. Is the app still running?'; }
}

// ── Drawers ──────────────────────────────────────────────────────────────────
function openDrawer(id) {
  document.querySelector('.scrim').classList.remove('hidden');
  $(id).classList.remove('hidden');
  if (id === 'speakersDrawer') $('qr').innerHTML = `<img src="/api/qr?v=${Date.now()}" alt="QR code for the speaker page">`;
}
function closeDrawers() {
  document.querySelector('.scrim').classList.add('hidden');
  document.querySelectorAll('.drawer').forEach(d => d.classList.add('hidden'));
}

// ── Wiring ───────────────────────────────────────────────────────────────────
$('horn').onclick = () => fire('goal');
$('winBtn').onclick = () => fire('win');
$('stopBtn').onclick = () => api('/api/stop', { method: 'POST' });
$('speakersBtn').onclick = () => openDrawer('speakersDrawer');
$('settingsBtn').onclick = () => openDrawer('settingsDrawer');
document.querySelectorAll('[data-close]').forEach(el => (el.onclick = closeDrawers));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });
$('speakerList').onclick = e => { const b = e.target.closest('[data-test]'); if (b) api('/api/test', { body: { id: b.dataset.test } }); };

$('autoGoal').onchange = e => saveSetting({ autoGoal: e.target.checked });
$('autoWin').onchange = e => saveSetting({ autoWin: e.target.checked });
$('playHere').onchange = e => saveSetting({ playHere: e.target.checked });
$('playBrowser').onchange = e => {
  localStorage.setItem('gh.playBrowser', e.target.checked ? '1' : '0');
  if (e.target.checked) Horn.unlock().catch(() => {});
  live.reopen(myRole(), myName());
};
let sliderTimer;
for (const [id, label] of [['delay', 'delayVal'], ['volume', 'volumeVal']]) {
  $(id).oninput = e => { $(label).textContent = e.target.value; clearTimeout(sliderTimer); sliderTimer = setTimeout(() => saveSetting({ [id]: Number(e.target.value) }), 400); };
}
$('libraryUrl').onchange = e => saveSetting({ libraryUrl: e.target.value.trim() });
$('refreshLib').onclick = async () => {
  $('refreshLib').disabled = true;
  try { applyState(await api('/api/horns/refresh', { method: 'POST' })); toast('Horns are up to date.'); }
  catch (e) { toast(e.message); } finally { $('refreshLib').disabled = false; }
};

document.querySelectorAll('[data-preview]').forEach(b => (b.onclick = async () => {
  const t = b.dataset.preview;
  try { await Horn.unlock(); await Horn.play(t, S.horns[t].src, S.settings.volume / 100); } catch (e) { toast(e.message); }
}));
document.querySelectorAll('[data-upload]').forEach(inp => (inp.onchange = async () => {
  const f = inp.files[0]; inp.value = '';
  if (!f) return;
  if (!/\.mp3$/i.test(f.name)) { $('uploadMsg').textContent = 'Only MP3 files work. Convert the file to MP3 and try again.'; return; }
  $('uploadMsg').textContent = 'Uploading ' + f.name + '...';
  try { applyState(await api('/api/upload/' + inp.dataset.upload, { body: f })); $('uploadMsg').textContent = 'Saved ' + f.name + ' for the ' + S.team.name + '.'; }
  catch (e) { $('uploadMsg').textContent = e.message; }
}));

$('editorLoad').onclick = async () => {
  try {
    const d = await api('/api/admin/file?name=' + $('editorPick').value);
    $('editor').value = d.content; $('editor').classList.remove('hidden'); $('editorActions').classList.remove('hidden'); $('editorMsg').textContent = '';
  } catch (e) { toast(e.message); }
};
$('editorSave').onclick = async () => {
  try {
    await api('/api/admin/file?name=' + $('editorPick').value, { body: { content: $('editor').value } });
    $('editorMsg').textContent = 'Saved. A backup of the old version is next to it.';
    if ($('editorPick').value === 'custom.css') document.querySelector('link[href="/custom.css"]').href = '/custom.css?v=' + Date.now();
  } catch (e) { $('editorMsg').textContent = e.message; }
};

// ── Start ────────────────────────────────────────────────────────────────────
(async function start() {
  try { applyState(await api('/api/state')); }
  catch (e) { $('notice').textContent = 'Goal Horn is not responding. Is the app still running?'; return; }
  live = connectLive(myRole(), myName(), {
    hello: d => renderHorns(d.horns),
    play: onPlay,
    stop: () => { Horn.stop(); setSounding(false); },
    speakers: renderSpeakers,
    state: applyState,
    horns: renderHorns,
  });
  pollGame();
  setInterval(pollGame, 5000);
})();
