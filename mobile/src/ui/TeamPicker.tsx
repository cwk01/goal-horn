import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LEAGUE_IDS, LeagueId, teams } from '../teams';
import { base, fonts, type Palette } from '../theme';

interface Props {
  league: LeagueId;
  team: string;
  palette: Palette;
  onPick: (league: LeagueId, team: string) => void;
}

export function TeamPicker({ league, team, palette, onPick }: Props) {
  const [shown, setShown] = useState<LeagueId>(league);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return teams[shown].filter(t => !s || t.name.toLowerCase().includes(s) || t.abbrev.toLowerCase().includes(s));
  }, [shown, q]);

  return (
    <View>
      <View style={styles.pills}>
        {LEAGUE_IDS.map(l => {
          const on = l === shown;
          return (
            <Pressable key={l} onPress={() => { setShown(l); setQ(''); }} style={[styles.pill, on && { backgroundColor: palette.accent, borderColor: palette.accent }]}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[styles.pillText, on && { color: palette.onAccent }]}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search teams" placeholderTextColor={base.faint} style={styles.search} autoCorrect={false} />
      <View style={styles.list}>
        {list.map((t, i) => {
          const on = shown === league && t.abbrev === team;
          return (
            <Pressable key={t.abbrev} onPress={() => onPick(shown, t.abbrev)}
              style={[styles.row, i > 0 && styles.rowLine, on && { backgroundColor: palette.cardFill }]}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <View style={[styles.chip, { backgroundColor: t.primary, borderColor: t.secondary }]} />
              <Text style={[styles.name, on && { color: palette.accent }]}>{t.name}</Text>
              <Text style={styles.abbr}>{t.abbrev}</Text>
            </Pressable>
          );
        })}
        {!list.length && <Text style={[styles.abbr, { padding: 14 }]}>No team matches "{q}".</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: base.line, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 },
  pillText: { fontFamily: fonts.labelBold, color: base.text, fontSize: 16, letterSpacing: 1.5 },
  search: { marginTop: 12, borderWidth: 1, borderColor: base.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: base.text, fontFamily: fonts.body, fontSize: 17, backgroundColor: base.panel },
  list: { marginTop: 10, borderWidth: 1, borderColor: base.line, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: base.line },
  chip: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  name: { flex: 1, fontFamily: fonts.name, color: base.text, fontSize: 19 },
  abbr: { fontFamily: fonts.label, color: base.faint, fontSize: 15, letterSpacing: 2 },
});
