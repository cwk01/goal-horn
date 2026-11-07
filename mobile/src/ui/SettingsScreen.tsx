import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { phoneInfo, scan, tryAddress, type Found, type ScanProgress } from '../discover';
import type { HornSource, HornType, Resolved } from '../library';
import type { LinkStatus } from '../remote';
import { DEFAULT_LIBRARY_URL, type Settings } from '../settings';
import { LEAGUES, LeagueId, findTeam } from '../teams';
import { base, fonts, type Palette } from '../theme';
import { TeamPicker } from './TeamPicker';

interface Props {
  visible: boolean;
  settings: Settings;          // this phone's settings, with the computer's game settings merged in when joined
  palette: Palette;
  horns: Record<HornType, Resolved>;
  message: string;
  link: { status: LinkStatus; problem: string } | null;
  onClose: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onPreview: (type: HornType) => void;
  onChoose: (type: HornType) => void;
  onRemove: (type: HornType) => void;
  onRedownload: () => void;
  onJoin: (f: Found) => void;
  onLeave: () => void;
  onTest: () => void;
}

const SOURCE: Record<HornSource, string> = {
  yours: 'Your file',
  library: 'Team horn from the library',
  generic: 'Generic horn from the library',
  'built-in': 'Built-in horn',
};

export function SettingsScreen(p: Props) {
  const insets = useSafeAreaInsets();
  const s = p.settings;
  const joined = s.joined;
  const league = LEAGUES[s.league];
  const team = findTeam(s.league, s.team);
  const [url, setUrl] = useState(s.libraryUrl === DEFAULT_LIBRARY_URL ? '' : s.libraryUrl);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState(s.speakerName);
  const thumb = (on: boolean) => (on ? p.palette.accent : base.muted);
  const track = { true: p.palette.accentDim, false: base.line };

  useEffect(() => { if (!p.visible) setPicking(false); }, [p.visible]);

  const toggle = (label: string, key: 'autoGoal' | 'autoWin' | 'learnDelay' | 'keepAwake' | 'playHere', hint?: string) => (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch value={s[key]} onValueChange={v => p.onChange({ [key]: v })} thumbColor={thumb(s[key])} trackColor={track} />
    </View>
  );

  const step = (n: number) => (
    <Pressable onPress={() => p.onChange({ delay: Math.max(0, Math.min(120, s.delay + n)) })} style={styles.step} accessibilityRole="button" accessibilityLabel={`${n > 0 ? 'Add' : 'Subtract'} ${Math.abs(n)} seconds`}>
      <Text style={styles.stepText}>{n > 0 ? '+' + n : n}</Text>
    </Pressable>
  );

  const hornRow = (type: HornType, title: string) => (
    <View style={styles.box}>
      <Text style={styles.label}>{title}</Text>
      <Text style={styles.hint}>{SOURCE[p.horns[type].source]}</Text>
      <View style={styles.actions}>
        <Btn text="Play" onPress={() => p.onPreview(type)} />
        <Btn text="Choose MP3" onPress={() => p.onChoose(type)} />
        {p.horns[type].source === 'yours' && <Btn text="Remove" onPress={() => p.onRemove(type)} />}
      </View>
    </View>
  );

  return (
    <Modal visible={p.visible} animationType="slide" onRequestClose={p.onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.bar}>
          <Text style={styles.title}>Settings</Text>
          <Btn text="Done" onPress={p.onClose} accent={p.palette} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.h, { marginTop: 6 }]}>Your team</Text>
          {joined && <Text style={styles.hint}>Changing the team here changes it on {joined.label} too.</Text>}
          <Pressable onPress={() => setPicking(v => !v)} style={[styles.box, styles.current]} accessibilityRole="button" accessibilityLabel={picking ? 'Close the team list' : 'Change team'}>
            <View style={[styles.chip, { backgroundColor: team?.primary, borderColor: team?.secondary }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{team?.name}</Text>
              <Text style={styles.hint}>{league.name}</Text>
            </View>
            <Text style={[styles.change, { color: p.palette.accent }]}>{picking ? 'CLOSE' : 'CHANGE'}</Text>
          </Pressable>
          {picking && (
            <View style={{ marginTop: 12 }}>
              <TeamPicker league={s.league} team={s.team} palette={p.palette}
                onPick={(l: LeagueId, t: string) => { p.onChange({ league: l, team: t }); setPicking(false); }} />
            </View>
          )}

          <Computer {...p} name={name} setName={setName} />

          <Text style={styles.h}>When your team scores</Text>
          <Text style={styles.hint}>Press the horn when you see the {league.horn.toLowerCase()} on TV. That's the most accurate way, and each press teaches Goal Horn your TV delay.</Text>
          {toggle(`Sound the ${league.horn.toLowerCase()} horn automatically`, 'autoGoal',
            'Scores reach the data feeds anywhere from a few seconds to half a minute late, so this can go off early or late. A goal taken back on review can still sound it.')}
          {toggle('Sound the win horn after a win', 'autoWin')}

          <Text style={styles.h}>TV delay</Text>
          <Text style={styles.hint}>How far your TV runs behind the live data. The scoreboard, and the automatic horn if it's on, wait this long so they match what you see.</Text>
          <View style={styles.stepper}>
            {step(-5)}{step(-1)}
            <Text style={[styles.delay, { color: p.palette.accent }]}>{s.delay}s</Text>
            {step(1)}{step(5)}
          </View>
          {s.delayMeasured.length > 0 && (
            <Text style={styles.hint}>Measured from the last {s.delayMeasured.length === 1 ? 'press' : s.delayMeasured.length + ' presses'}: {s.delayMeasured.map(n => n + 's').join(', ')}.</Text>
          )}
          {toggle('Learn the TV delay when I press the horn', 'learnDelay')}

          <Text style={styles.h}>Horn sounds</Text>
          {joined ? (
            <Text style={styles.hint}>The horns come from {joined.label}. Change them in Goal Horn's Settings on that computer.</Text>
          ) : (
            <>
              <Text style={styles.hint}>Goal Horn downloads your team's horn when the library has one. An MP3 you choose stays on this phone and is used for this team only.</Text>
              {hornRow('goal', `${league.horn} horn`)}
              {hornRow('win', 'Win horn')}
            </>
          )}
          {!!p.message && <Text style={[styles.hint, { color: p.palette.accent, marginTop: 8 }]}>{p.message}</Text>}

          <Text style={styles.h}>Screen</Text>
          {toggle('Keep the screen on during games', 'keepAwake',
            'Android pauses apps in the background, so leave Goal Horn open on screen while the game is on. Plugged in is best.')}

          {!joined && (
            <>
              <Text style={styles.h}>Horn library</Text>
              <TextInput value={url} onChangeText={setUrl} onEndEditing={() => p.onChange({ libraryUrl: url.trim() || DEFAULT_LIBRARY_URL })}
                placeholder={DEFAULT_LIBRARY_URL} placeholderTextColor={base.faint} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
              <Text style={styles.hint}>Where team horns download from. Leave it blank for the default.</Text>
              <View style={styles.actions}><Btn text="Download horns again" onPress={p.onRedownload} /></View>
            </>
          )}

          <Text style={[styles.hint, { marginTop: 28 }]}>Goal Horn {Constants.expoConfig?.version || ''} · goalhorn.colbykordas.com</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

// Find, join and leave a Goal Horn computer on the same Wi-Fi.
function Computer(p: Props & { name: string; setName: (v: string) => void }) {
  const s = p.settings;
  const joined = s.joined;
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [addr, setAddr] = useState('');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const cancel = useRef({ cancelled: false });

  useEffect(() => () => { cancel.current.cancelled = true; }, []);
  useEffect(() => { if (!p.visible) { cancel.current.cancelled = true; setBusy(false); } }, [p.visible]);

  // Always ends with a message: what it found, that it found nothing, or that it stopped.
  const find = async () => {
    const run = { cancelled: false };
    cancel.current = run;
    setBusy(true); setFound([]); setMsg(''); setProgress(null);
    const limit = setTimeout(() => { run.cancelled = true; }, 30000);
    let net = '';
    try {
      const list = await scan({
        signal: run,
        onProgress: pr => { net = pr.network; setProgress(pr); },
        onFound: f => setFound(prev => [...prev.filter(x => x.id !== f.id), f]),
      });
      if (list.length) setMsg(list.length === 1 ? 'Found 1 computer. Tap Join.' : `Found ${list.length} computers. Tap Join on yours.`);
      else if (run.cancelled && !p.visible) setMsg('');
      else setMsg(`${run.cancelled ? 'Stopped. ' : ''}${await phoneInfo()}\nNo Goal Horn computer answered on ${net || 'this Wi-Fi'}. Check that Goal Horn is open on the computer and that the phone is on the same Wi-Fi. On Windows, Goal Horn has to be allowed through the firewall on private networks. You can also type the address shown under Speakers on the computer.`);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      clearTimeout(limit);
      setBusy(false);
      setProgress(null);
    }
  };

  const connect = async () => {
    if (!addr.trim()) { setMsg("Type the computer's address first, like 192.168.4.20."); return; }
    setBusy(true); setMsg(`Trying ${addr.trim()}`);
    const r = await tryAddress(addr).catch(e => ({ found: null, tried: [{ url: addr.trim(), error: String(e?.message || e) }] }));
    const me = r.found ? '' : await phoneInfo();
    setBusy(false);
    if (r.found) { setMsg(''); p.onJoin(r.found); return; }
    setMsg(`Couldn't reach Goal Horn at ${addr.trim()}.\n${r.tried.map(t => `${t.url.replace(/^http:\/\//, '')}: ${t.error}`).join('\n')}\n${me}\nIf Chrome on this phone opens the speaker page at that address, send me these lines.`);
  };

  const statusText = !p.link ? '' : p.link.status === 'connected' ? `Connected to ${joined?.label}` : p.link.status === 'connecting' ? `Connecting to ${joined?.label}` : p.link.problem;

  if (joined) {
    return (
      <>
        <Text style={styles.h}>Goal Horn computer</Text>
        <View style={styles.box}>
          <Text style={[styles.label, p.link?.status === 'lost' && { color: base.danger }]}>{statusText}</Text>
          <Text style={styles.hint}>This phone shows {joined.label}'s scoreboard and presses its horn. The horn plays on every speaker {joined.label} has, and on this phone if it's turned on below.</Text>
          <View style={styles.actions}>
            <Btn text="Test this phone" onPress={p.onTest} />
            <Btn text="Leave" onPress={p.onLeave} />
          </View>
        </View>
        <View style={styles.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Play the horn on this phone</Text>
            <Text style={styles.hint}>Turn off to use the phone as a remote only.</Text>
          </View>
          <Switch value={s.playHere} onValueChange={v => p.onChange({ playHere: v })} thumbColor={s.playHere ? p.palette.accent : base.muted} trackColor={{ true: p.palette.accentDim, false: base.line }} />
        </View>
        <Text style={styles.label}>Name on {joined.label}'s speaker list</Text>
        <TextInput value={p.name} onChangeText={p.setName} onEndEditing={() => p.onChange({ speakerName: p.name.trim() })}
          placeholder="Android phone" placeholderTextColor={base.faint} maxLength={40} style={[styles.input, { marginTop: 6 }]} />
      </>
    );
  }

  return (
    <>
      <Text style={styles.h}>Goal Horn computer</Text>
      <Text style={styles.hint}>If Goal Horn is running on a computer or home server on this Wi-Fi, join it. The phone then presses that computer's horn and plays along with its other speakers.</Text>
      <View style={styles.actions}>
        <Btn text={busy ? 'Stop' : 'Find computers'} onPress={busy ? () => { cancel.current.cancelled = true; } : find} />
        {busy && <ActivityIndicator color={p.palette.accent} />}
        {busy && <Text style={[styles.hint, { alignSelf: 'center' }]}>{progress ? `Checking ${progress.network}: ${progress.checked} of ${progress.total}` : 'Reading this phone\'s Wi-Fi'}</Text>}
      </View>
      {found.map(f => (
        <View key={f.id} style={[styles.box, styles.current]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{f.label}</Text>
            <Text style={styles.hint}>{[f.team, f.base.replace(/^http:\/\//, '')].filter(Boolean).join(' · ')}</Text>
          </View>
          <Btn text="Join" onPress={() => { cancel.current.cancelled = true; p.onJoin(f); }} accent={p.palette} />
        </View>
      ))}
      <View style={[styles.actions, { alignItems: 'center' }]}>
        <TextInput value={addr} onChangeText={setAddr} placeholder="Or type its address, like 192.168.4.20" placeholderTextColor={base.faint}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" onSubmitEditing={connect} style={[styles.input, { flex: 1 }]} />
        <Btn text="Connect" onPress={connect} />
      </View>
      {!!msg && <Text style={[styles.hint, { marginTop: 8 }]}>{msg}</Text>}
    </>
  );
}

function Btn({ text, onPress, accent }: { text: string; onPress: () => void; accent?: Palette }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, accent && { backgroundColor: accent.accent, borderColor: accent.accent }]} accessibilityRole="button">
      <Text style={[styles.btnText, accent && { color: accent.onAccent }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: base.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: base.line },
  title: { fontFamily: fonts.display, color: base.text, fontSize: 26 },
  h: { fontFamily: fonts.display, color: base.text, fontSize: 19, marginTop: 30, marginBottom: 8 },
  label: { fontFamily: fonts.name, color: base.text, fontSize: 19 },
  hint: { fontFamily: fonts.body, color: base.muted, fontSize: 16, lineHeight: 21, marginTop: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  step: { borderWidth: 1, borderColor: base.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: base.panel },
  stepText: { fontFamily: fonts.labelBold, color: base.text, fontSize: 17 },
  delay: { fontFamily: fonts.display, fontSize: 30, minWidth: 80, textAlign: 'center' },
  box: { borderWidth: 1, borderColor: base.line, borderRadius: 16, padding: 14, marginTop: 10, backgroundColor: base.panel },
  current: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  change: { fontFamily: fonts.labelBold, fontSize: 15, letterSpacing: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { borderWidth: 1, borderColor: base.line, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: base.bg },
  btnText: { fontFamily: fonts.labelBold, color: base.text, fontSize: 16, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: base.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: base.text, fontFamily: fonts.body, fontSize: 16, backgroundColor: base.panel },
});
