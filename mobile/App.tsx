import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { File } from 'expo-file-system';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { HornType, Library, Resolved } from './src/library';
import * as player from './src/player';
import { Settings, SettingsStore } from './src/settings';
import { LEAGUES, findTeam } from './src/teams';
import { base, fonts, paletteFor } from './src/theme';
import { Tracker, TrackerView } from './src/tracker';
import { NextCard, ScoreCard } from './src/ui/GameCard';
import { Goals } from './src/ui/Goals';
import { Horn } from './src/ui/Horn';
import { Rink } from './src/ui/Rink';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { TeamPicker } from './src/ui/TeamPicker';

if (process.env.EXPO_PUBLIC_DEMO) require('./src/demo').install(process.env.EXPO_PUBLIC_DEMO);

const store = new SettingsStore();
const tracker = new Tracker(store, m => console.log('[goal-horn] ' + m));
let library: Library | null = null;
// The web preview has no phone storage; it falls back to the built-in horns.
const builtIn: Library = {
  resolve: () => ({ goal: { source: 'built-in', uri: null }, win: { source: 'built-in', uri: null } }),
  sync: async () => [],
  saveYours: async () => { throw new Error('Choosing files works on the phone.'); },
  removeYours: () => {},
} as unknown as Library;
const lib = () => {
  if (!library) { try { library = new Library(); } catch (e) { library = builtIn; } }
  return library;
};

export default function App() {
  const [fontsLoaded] = useFonts({
    RussoOne: require('./assets/fonts/RussoOne.ttf'),
    'BarlowCondensed-Medium': require('./assets/fonts/BarlowCondensed-Medium.ttf'),
    'BarlowCondensed-MediumItalic': require('./assets/fonts/BarlowCondensed-MediumItalic.ttf'),
    'BarlowCondensed-SemiBold': require('./assets/fonts/BarlowCondensed-SemiBold.ttf'),
    'BarlowCondensed-Bold': require('./assets/fonts/BarlowCondensed-Bold.ttf'),
  });
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    store.load().then(setSettings);
    player.setupAudio().catch(() => {});
    return store.subscribe(s => setSettings(s));
  }, []);

  if (!fontsLoaded || !settings) return <View style={{ flex: 1, backgroundColor: base.bg }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {settings.setupDone ? <Main settings={settings} /> : <Welcome settings={settings} />}
    </SafeAreaProvider>
  );
}

function Welcome({ settings }: { settings: Settings }) {
  const insets = useSafeAreaInsets();
  const [pick, setPick] = useState<{ league: Settings['league']; team: string } | null>(null);
  const palette = paletteFor(pick ? findTeam(pick.league, pick.team) : findTeam(settings.league, settings.team));
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: insets.bottom + 40 }}>
        <Text style={[styles.kicker, { color: palette.accentDim, textAlign: 'left' }]}>GOAL HORN</Text>
        <Text style={styles.welcome}>Who do you cheer for?</Text>
        <Text style={styles.welcomeSub}>Goal Horn follows your team's games on this phone. When they score, press the horn. Each press teaches it how far your TV runs behind the live data.</Text>
        <TeamPicker league={pick?.league || settings.league} team={pick?.team || ''} palette={palette}
          onPick={(league, team) => setPick({ league, team })} />
        <Pressable disabled={!pick} onPress={() => pick && store.update({ ...pick, setupDone: true })}
          style={[styles.start, { backgroundColor: palette.accent, opacity: pick ? 1 : 0.4 }]} accessibilityRole="button">
          <Text style={[styles.startText, { color: palette.onAccent }]}>{pick ? `START WITH THE ${findTeam(pick.league, pick.team)?.name.toUpperCase()}` : 'PICK A TEAM'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Main({ settings }: { settings: Settings }) {
  const insets = useSafeAreaInsets();
  const team = findTeam(settings.league, settings.team);
  const league = LEAGUES[settings.league];
  const palette = useMemo(() => paletteFor(team), [team]);
  const [view, setView] = useState<TrackerView>(tracker.view);
  const [playing, setPlaying] = useState<HornType | null>(null);
  const [horns, setHorns] = useState<Record<HornType, Resolved>>(() => lib().resolve(settings.league, settings.team));
  const [showSettings, setShowSettings] = useState(false);
  const [note, setNote] = useState('');
  const [hornMsg, setHornMsg] = useState('');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hornsRef = useRef(horns);
  hornsRef.current = horns;

  const flash = useCallback((text: string) => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(''), 8000);
  }, []);

  const sound = useCallback((type: HornType) => {
    player.play(type, hornsRef.current[type], store.get().volume);
  }, []);

  // Tracker, player and app lifecycle.
  useEffect(() => {
    const offs = [
      tracker.on('change', v => setView(v)),
      tracker.on('horn', type => sound(type)),
      tracker.on('delay', e => {
        if (e.ignored) flash(`That press was ${e.measured}s from the score change, too far off to count`);
        else if (e.applied != null) flash(`TV delay set to ${e.applied}s`);
        else flash(`Your TV ran ${e.measured}s behind on that one`);
      }),
      player.onPlaying(setPlaying),
    ];
    tracker.start();
    const app = AppState.addEventListener('change', st => { if (st === 'active') tracker.refresh(); });
    return () => { offs.forEach(off => off()); app.remove(); tracker.stop(); };
  }, [sound, flash]);

  // New team: start over and fetch its horns.
  const teamKey = settings.league + ':' + settings.team;
  const firstKey = useRef(teamKey);
  useEffect(() => {
    if (firstKey.current !== teamKey) { tracker.reset(); tracker.refresh(); }
    firstKey.current = teamKey;
    setHorns(lib().resolve(settings.league, settings.team));
    lib().sync(settings.libraryUrl, settings.league, settings.team)
      .then(() => setHorns(lib().resolve(settings.league, settings.team)))
      .catch(() => {});
  }, [teamKey, settings.libraryUrl, settings.league, settings.team]);

  const game = view.game;
  const live = game?.state === 'LIVE';
  const soon = !!game?.start && game.state === 'FUT' && +new Date(game.start) - Date.now() < 30 * 60000;

  // Keep the screen on while a game is on or about to start.
  useEffect(() => {
    if (!settings.keepAwake || !(live || soon)) return;
    activateKeepAwakeAsync('game').catch(() => {});
    return () => { deactivateKeepAwake('game').catch(() => {}); };
  }, [settings.keepAwake, live, soon]);

  const pressHorn = () => {
    if (playing === 'goal') { player.stop(); return; }
    sound('goal');
    tracker.notePress();
  };

  const status = playing ? `${playing === 'win' ? 'Win' : league.horn} horn playing`
    : note || (settings.autoGoal ? 'Ready · auto horn on' : 'Ready');

  // What goes under the horn: today's game if there is one, else the next game,
  // then your team's goals from today or the last game.
  const upcoming = game && game.state === 'FUT' ? game : view.next;
  const goalsGame = game && game.state !== 'FUT' ? game : view.last;
  const now = Date.now();

  const chooseHorn = async (type: HornType) => {
    setHornMsg('');
    try {
      const res = await File.pickFileAsync({ mimeTypes: ['audio/mpeg', 'audio/mp3'] });
      if (res.canceled) return;
      await lib().saveYours(settings.league, settings.team, type, res.result);
      setHorns(lib().resolve(settings.league, settings.team));
      setHornMsg(`Saved. The ${team?.name} will use your ${type === 'win' ? 'win' : league.horn.toLowerCase()} horn.`);
    } catch (e: any) {
      setHornMsg(e?.message || 'Could not use that file.');
    }
  };

  return (
    <View style={styles.screen}>
      <Rink accent={palette.accent} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}>
        <View style={styles.header}>
          <View style={{ width: 52 }} />
          <Text style={[styles.kicker, { color: palette.accentDim }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {(team?.name || '').toUpperCase()}  ·  {league.horn.toUpperCase()} HORN
          </Text>
          <Pressable onPress={() => setShowSettings(true)} style={[styles.gear, { borderColor: base.line }]} accessibilityRole="button" accessibilityLabel="Settings">
            <Gear color={base.muted} />
          </Pressable>
        </View>

        <View style={{ marginTop: 18 }}>
          <Horn label={league.button} status={status} playing={!!playing} palette={palette}
            onPress={pressHorn} onStop={() => player.stop()} />
        </View>

        <View style={{ marginTop: 30, gap: 14 }}>
          {game && game.state !== 'FUT' && <ScoreCard game={game} team={settings.team} palette={palette} delay={settings.delay} />}
          {upcoming && (game?.state !== 'LIVE') && (
            <NextCard game={upcoming} team={settings.team} title={upcoming === game ? 'TODAY' : 'NEXT GAME'} palette={palette} now={now} />
          )}
          {!game && !upcoming && (
            <Text style={styles.notice}>{view.loading ? 'Checking the schedule' : view.error ? `Can't reach the ${league.name} schedule right now (${view.error}). Trying again shortly.` : `No ${team?.name} games on the schedule.`}</Text>
          )}
          {!!view.error && (game || upcoming) && <Text style={[styles.notice, { color: base.danger }]}>Score data isn't loading: {view.error}</Text>}
        </View>

        {goalsGame && (
          <View style={{ marginTop: 32 }}>
            <Goals game={goalsGame} team={settings.team} palette={palette} previous={goalsGame !== game} />
          </View>
        )}
      </ScrollView>

      <SettingsScreen
        visible={showSettings}
        settings={settings}
        palette={palette}
        horns={horns}
        message={hornMsg}
        onClose={() => { setShowSettings(false); setHornMsg(''); }}
        onChange={patch => store.update(patch)}
        onPreview={type => (playing === type ? player.stop() : sound(type))}
        onChoose={chooseHorn}
        onRemove={type => { lib().removeYours(settings.league, settings.team, type); setHorns(lib().resolve(settings.league, settings.team)); setHornMsg('Removed. Back to the library horn.'); }}
        onRedownload={() => {
          setHornMsg('Downloading');
          lib().sync(settings.libraryUrl, settings.league, settings.team, true).then(results => {
            setHorns(lib().resolve(settings.league, settings.team));
            const got = results.filter(r => r.result === 'ok').length;
            setHornMsg(results.some(r => r.result === 'error') ? "Couldn't reach the horn library." : `Done. ${got} horn${got === 1 ? '' : 's'} downloaded.`);
          });
        }}
      />
    </View>
  );
}

function Gear({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      <Path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={6.5} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: base.bg },
  header: { flexDirection: 'row', alignItems: 'center' },
  kicker: { flex: 1, fontFamily: fonts.display, fontSize: 13, letterSpacing: 3, textAlign: 'center', marginHorizontal: 6 },
  gear: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.02)' },
  notice: { fontFamily: fonts.body, color: base.muted, fontSize: 17, textAlign: 'center', lineHeight: 22 },
  welcome: { fontFamily: fonts.display, color: base.text, fontSize: 40, lineHeight: 44, marginTop: 10 },
  welcomeSub: { fontFamily: fonts.body, color: base.muted, fontSize: 18, lineHeight: 23, marginTop: 10, marginBottom: 22 },
  start: { marginTop: 22, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  startText: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 2 },
});
