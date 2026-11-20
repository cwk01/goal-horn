import { StyleSheet, Text, View } from 'react-native';
import { countdown, gameDay, gameTime, pad } from '../format';
import { base, fonts, type Palette } from '../theme';
import type { Game } from '../types';
import { Logo } from './Logo';

function Card({ title, palette, children }: { title: string; palette: Palette; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: palette.cardFill, borderColor: palette.cardLine }]}>
      <Text style={[styles.title, { color: palette.accentDim }]}>{title}</Text>
      {children}
    </View>
  );
}

// Your team on the left, opponent on the right.
const ordered = (g: Game, team: string) => (g.home.abbrev === team ? [g.home, g.away] : [g.away, g.home]);

// Upcoming game: logos, date, time, venue and a countdown.
export function NextCard({ game, team, title, palette, now }: { game: Game; team: string; title: string; palette: Palette; now: number }) {
  const left = countdown(game.start, now);
  const [a, b] = ordered(game, team);
  return (
    <Card title={title} palette={palette}>
      <View style={styles.vsRow}>
        <View style={styles.team}><Logo url={a.logo} abbrev={a.abbrev} size={64} /><Text style={styles.abbr}>{a.abbrev}</Text></View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.team}><Logo url={b.logo} abbrev={b.abbrev} size={64} /><Text style={styles.abbr}>{b.abbrev}</Text></View>
      </View>
      <Text style={[styles.day, { color: palette.accent }]}>{gameDay(game)}</Text>
      {!!gameTime(game) && <Text style={styles.time}>{gameTime(game)}</Text>}
      {!!game.venue && <Text style={styles.venue}>{game.venue.toUpperCase()}</Text>}
      {left && (
        <View style={styles.clock}>
          {([['DAYS', String(left.days)], ['HRS', pad(left.hrs)], ['MIN', pad(left.min)], ['SEC', pad(left.sec)]] as const).map(([unit, v], i) => (
            <View key={unit} style={styles.clockGroup}>
              {i > 0 && <Text style={styles.colon}>:</Text>}
              <View style={styles.clockCell}>
                <Text style={styles.clockNum}>{v}</Text>
                <Text style={styles.clockUnit}>{unit}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

// Live or finished game: logos and scores, with the clock line under them.
export function ScoreCard({ game, team, palette, delay }: { game: Game; team: string; palette: Palette; delay: number }) {
  const live = game.state === 'LIVE';
  const title = live ? 'LIVE' : 'FINAL';
  const side = (s: Game['home']) => (
    <View style={styles.team}>
      <Logo url={s.logo} abbrev={s.abbrev} size={64} />
      <Text style={styles.abbr}>{s.abbrev}</Text>
      <Text style={[styles.score, s.abbrev === team && { color: palette.accent }]}>{s.score}</Text>
    </View>
  );
  const sit = game.situation;
  return (
    <Card title={title} palette={palette}>
      <View style={styles.vsRow}>
        {side(ordered(game, team)[0])}
        <Text style={styles.vs}>VS</Text>
        {side(ordered(game, team)[1])}
      </View>
      {!!game.status && <Text style={[styles.time, live && { color: palette.accent }]}>{game.status.toUpperCase()}</Text>}
      {!!sit && (
        <Text style={styles.venue}>
          {sit.possession ? sit.possession + ' BALL · ' : ''}{sit.text.toUpperCase()}{sit.redZone ? ' · RED ZONE' : ''}
        </Text>
      )}
      {live && <Text style={styles.delay}>{delay > 0 ? `SCOREBOARD HELD ${delay}S TO MATCH YOUR TV` : 'SCOREBOARD IS LIVE, NO TV DELAY'}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, paddingVertical: 26, paddingHorizontal: 18, alignItems: 'center' },
  title: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 7, marginBottom: 22 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34 },
  team: { alignItems: 'center', minWidth: 80 },
  abbr: { fontFamily: fonts.label, color: base.muted, fontSize: 18, letterSpacing: 4, marginTop: 14 },
  score: { fontFamily: fonts.display, color: base.text, fontSize: 52, marginTop: 4 },
  vs: { fontFamily: fonts.display, color: base.faint, fontSize: 30, marginTop: -24 },
  day: { fontFamily: fonts.display, fontSize: 30, marginTop: 22 },
  time: { fontFamily: fonts.label, color: base.muted, fontSize: 19, letterSpacing: 4, marginTop: 6, textAlign: 'center' },
  venue: { fontFamily: fonts.body, color: base.faint, fontSize: 15, letterSpacing: 3, marginTop: 4, textAlign: 'center' },
  delay: { fontFamily: fonts.body, color: base.faint, fontSize: 13, letterSpacing: 2, marginTop: 14, textAlign: 'center' },
  clock: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 22 },
  clockGroup: { flexDirection: 'row', alignItems: 'flex-start' },
  colon: { fontFamily: fonts.display, color: base.faint, fontSize: 26, marginHorizontal: 8, marginTop: 6 },
  clockCell: { alignItems: 'center', minWidth: 58 },
  clockNum: { fontFamily: fonts.display, color: base.text, fontSize: 40, fontVariant: ['tabular-nums'] },
  clockUnit: { fontFamily: fonts.label, color: base.faint, fontSize: 13, letterSpacing: 3, marginTop: 4 },
});
