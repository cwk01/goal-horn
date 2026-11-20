// Your team's scoring plays only, newest first, like the home setup.
import { StyleSheet, Text, View } from 'react-native';
import { shortDay } from '../format';
import { LEAGUES } from '../teams';
import { base, fonts, type Palette } from '../theme';
import type { Game, ScoringPlay } from '../types';

const BADGE: Record<string, string> = { pp: 'PP', sh: 'SH', en: 'EN', ps: 'PS', td: 'TD', fg: 'FG', saf: 'SAF', '2pt': '2PT', hr: 'HR' };

export function Goals({ game, team, palette, previous }: { game: Game; team: string; palette: Palette; previous: boolean }) {
  const mine = game.scoring.filter(p => p.team === team);
  if (!mine.length) return null;
  // Count each scorer's goals within this game so a second goal shows "#2".
  const counts = new Map<string, number>();
  const numbered = mine.map(p => {
    const key = String(p.playerId ?? p.text);
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    return { p, n };
  });
  const isHockey = LEAGUES[game.league].sport === 'hockey';
  const unit = LEAGUES[game.league].sport === 'hockey' ? 'GOALS' : LEAGUES[game.league].unit.toUpperCase();
  return (
    <View>
      <Text style={styles.head}>{team} {unit}</Text>
      <Text style={[styles.day, { color: palette.accentDim }]}>{previous ? shortDay(game) : 'TODAY'}</Text>
      {previous && <Text style={styles.sub}>From previous game</Text>}
      <View style={styles.list}>
        {numbered.reverse().map(({ p, n }, i) => (
          <Row key={i} play={p} nth={isHockey && n > 1 ? n : 0} palette={palette} />
        ))}
      </View>
    </View>
  );
}

function Row({ play, nth, palette }: { play: ScoringPlay; nth: number; palette: Palette }) {
  const when = [play.time, play.periodLabel].filter(Boolean).join(' ').toUpperCase();
  const badge = play.badge ? BADGE[play.badge] || play.badge.toUpperCase() : null;
  return (
    <View style={[styles.row, { borderColor: palette.cardLine, backgroundColor: palette.cardFill }]}>
      <View style={[styles.dot, { backgroundColor: palette.accentDim }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>{play.text}</Text>
        <View style={styles.meta}>
          {!!when && <Text style={styles.when}>{when}</Text>}
          {!!badge && <Text style={[styles.tag, { backgroundColor: palette.accentFill, color: palette.accent }]}>{badge}</Text>}
          {nth > 0 && <Text style={[styles.tag, { backgroundColor: palette.accentDim, color: palette.onAccent }]}>#{nth}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { fontFamily: fonts.display, color: base.faint, fontSize: 15, letterSpacing: 5 },
  day: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 4, marginTop: 4 },
  sub: { fontFamily: fonts.italic, color: base.faint, fontSize: 15, marginTop: 2 },
  list: { marginTop: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 9 },
  name: { fontFamily: fonts.name, color: base.text, fontSize: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  when: { fontFamily: fonts.body, color: base.faint, fontSize: 15, letterSpacing: 1 },
  tag: { fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
});
