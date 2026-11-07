import Constants from 'expo-constants';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HornSource, HornType, Resolved } from '../library';
import { DEFAULT_LIBRARY_URL, type Settings } from '../settings';
import { LEAGUES, LeagueId } from '../teams';
import { base, fonts, type Palette } from '../theme';
import { TeamPicker } from './TeamPicker';

interface Props {
  visible: boolean;
  settings: Settings;
  palette: Palette;
  horns: Record<HornType, Resolved>;
  message: string;
  onClose: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onPreview: (type: HornType) => void;
  onChoose: (type: HornType) => void;
  onRemove: (type: HornType) => void;
  onRedownload: () => void;
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
  const league = LEAGUES[s.league];
  const [url, setUrl] = useState(s.libraryUrl === DEFAULT_LIBRARY_URL ? '' : s.libraryUrl);
  const thumb = { true: p.palette.accent, false: base.muted };
  const track = { true: p.palette.accentDim, false: base.line };

  const toggle = (label: string, key: 'autoGoal' | 'autoWin' | 'learnDelay' | 'keepAwake', hint?: string) => (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch value={s[key]} onValueChange={v => p.onChange({ [key]: v })} thumbColor={thumb[String(s[key]) as 'true' | 'false']} trackColor={track} />
    </View>
  );

  const step = (n: number) => (
    <Pressable onPress={() => p.onChange({ delay: s.delay + n })} style={styles.step} accessibilityRole="button" accessibilityLabel={`${n > 0 ? 'Add' : 'Subtract'} ${Math.abs(n)} seconds`}>
      <Text style={styles.stepText}>{n > 0 ? '+' + n : n}</Text>
    </Pressable>
  );

  const hornRow = (type: HornType, name: string) => (
    <View style={styles.hornRow}>
      <Text style={styles.label}>{name}</Text>
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
          <Text style={styles.h}>Your team</Text>
          <TeamPicker league={s.league} team={s.team} palette={p.palette}
            onPick={(l: LeagueId, t: string) => p.onChange({ league: l, team: t })} />

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
            <Text style={styles.hint}>Measured from your last {s.delayMeasured.length === 1 ? 'press' : s.delayMeasured.length + ' presses'}: {s.delayMeasured.map(n => n + 's').join(', ')}.</Text>
          )}
          {toggle('Learn the TV delay when I press the horn', 'learnDelay')}

          <Text style={styles.h}>Horn sounds</Text>
          <Text style={styles.hint}>Goal Horn downloads your team's horn when the library has one. An MP3 you choose stays on this phone and is used for this team only.</Text>
          {hornRow('goal', `${league.horn} horn`)}
          {hornRow('win', 'Win horn')}
          {!!p.message && <Text style={[styles.hint, { color: p.palette.accent }]}>{p.message}</Text>}

          <Text style={styles.h}>Screen</Text>
          {toggle('Keep the screen on during games', 'keepAwake',
            'Android pauses apps in the background, so leave Goal Horn open on screen while the game is on. Plugged in is best.')}

          <Text style={styles.h}>Horn library</Text>
          <TextInput value={url} onChangeText={setUrl} onEndEditing={() => p.onChange({ libraryUrl: url.trim() || DEFAULT_LIBRARY_URL })}
            placeholder={DEFAULT_LIBRARY_URL} placeholderTextColor={base.faint} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
          <Text style={styles.hint}>Where team horns download from. Leave it blank for the default.</Text>
          <View style={styles.actions}><Btn text="Download horns again" onPress={p.onRedownload} /></View>

          <Text style={[styles.hint, { marginTop: 28 }]}>Goal Horn {Constants.expoConfig?.version || ''} · goalhorn.colbykordas.com</Text>
        </ScrollView>
      </View>
    </Modal>
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
  hornRow: { borderWidth: 1, borderColor: base.line, borderRadius: 16, padding: 14, marginTop: 10, backgroundColor: base.panel },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { borderWidth: 1, borderColor: base.line, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: base.bg },
  btnText: { fontFamily: fonts.labelBold, color: base.text, fontSize: 16, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: base.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: base.text, fontFamily: fonts.body, fontSize: 16, backgroundColor: base.panel },
});
