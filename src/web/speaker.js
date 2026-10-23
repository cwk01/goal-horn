// Speaker page: plays the horn whenever it fires anywhere in the house.
const $ = id => document.getElementById(id);
let horns = null, live = null, enabled = false, offline = false;

const savedName = () => localStorage.getItem('gh.speakerName') || defaultName();
function defaultName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/SmartTV|Tizen|Web0S|CrKey|AFT/.test(ua)) return 'TV';
  return 'Computer';
}
const volume = () => Number(localStorage.getItem('gh.myVolume') || 100);

function setState(text, detail) { $('state').textContent = text; if (detail !== undefined) $('detail').textContent = detail; }

async function reportReady() {
  if (!live || !live.id) return;
  try { await api('/api/ready', { body: { id: live.id, ready: enabled, name: savedName() } }); } catch (e) {}
}

async function enable() {
  try {
    await Horn.unlock();
    enabled = true;
    $('page').classList.add('ready');
    $('enable').classList.add('hidden');
    $('controls').classList.remove('hidden');
    setState('Ready. Leave this page open.', 'The horn will play here when it sounds. Keep the screen on and the device plugged in.');
    keepAwake();
    if (horns) for (const t of ['goal', 'win']) Horn.load(t, horns[t].src).catch(() => {});
    reportReady();
  } catch (e) {
    setState('This browser blocked sound.', 'Check that the device is not muted, then tap again.');
  }
}

Horn.onplay = (type, dur) => {
  $('page').classList.add('sounding');
  setState(type === 'win' ? 'Win horn' : 'Horn playing');
};
Horn.onend = () => {
  $('page').classList.remove('sounding');
  if (enabled) setState('Ready. Leave this page open.');
};

async function onPlay(d) {
  if (!enabled) { setState('The horn just sounded, but sound is off here.', 'Tap "Turn on sound" to hear the next one.'); return; }
  try { await Horn.play(d.type, d.src, (d.volume || 100) / 100 * volume() / 100); }
  catch (e) { setState('Could not play the horn.', e.message); }
}

async function loadTeam() {
  try {
    const s = await api('/api/state');
    applyTeamColor(s.team);
    $('teamName').textContent = s.team ? s.team.name : 'Goal Horn';
    document.title = (s.team ? s.team.name + ' ' : '') + 'speaker';
    horns = s.horns;
  } catch (e) {}
}

$('enable').onclick = enable;
$('test').onclick = () => horns && Horn.play('goal', horns.goal.src, volume() / 100).catch(e => setState('Could not play the horn.', e.message));
$('name').value = savedName();
$('name').onchange = e => { localStorage.setItem('gh.speakerName', e.target.value.trim() || defaultName()); reportReady(); };
$('vol').value = volume(); $('volVal').textContent = volume();
$('vol').oninput = e => { localStorage.setItem('gh.myVolume', e.target.value); $('volVal').textContent = e.target.value; };

loadTeam();
live = connectLive('speaker', savedName(), {
  hello: d => {
    horns = d.horns;
    if (offline) { offline = false; if (enabled) setState('Ready. Leave this page open.', 'Reconnected.'); }
    reportReady();
  },
  play: onPlay,
  stop: () => Horn.stop(),
  horns: h => { horns = h; if (enabled) for (const t of ['goal', 'win']) Horn.load(t, h[t].src).catch(() => {}); },
  state: s => { applyTeamColor(s.team); $('teamName').textContent = s.team ? s.team.name : 'Goal Horn'; },
  offline: () => { offline = true; setState('Lost the connection to Goal Horn.', 'Trying again. Make sure the computer running Goal Horn is on and on the same Wi-Fi.'); },
});
