import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { base, fonts, type Palette } from '../theme';

interface Props {
  label: string;          // GOAL, RUN, TD
  status: string;         // line under the button
  playing: boolean;
  palette: Palette;
  onPress: () => void;
  onStop: () => void;
}

export function Horn({ label, status, playing, palette, onPress, onStop }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!playing) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [playing, pulse]);

  const size = 236;
  const halo = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={styles.wrap}>
      <View style={{ width: size + 60, height: size + 60, alignItems: 'center', justifyContent: 'center' }}>
        {playing && (
          <Animated.View pointerEvents="none" style={[styles.halo, { width: size, height: size, borderRadius: size / 2, borderColor: palette.accent, opacity: haloOpacity, transform: [{ scale: halo }] }]} />
        )}
        <Pressable
          onPress={onPress}
          onPressIn={() => Animated.spring(press, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start()}
          onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 30 }).start()}
          accessibilityRole="button"
          accessibilityLabel={`Sound the ${label.toLowerCase()} horn`}
        >
          <Animated.View
            style={[styles.button, {
              width: size, height: size, borderRadius: size / 2,
              borderColor: palette.accent,
              backgroundColor: playing ? palette.accent : palette.accentFill,
              boxShadow: `0 0 ${playing ? 60 : 36}px ${palette.accent}${playing ? '88' : '40'}`,
              transform: [{ scale: press }],
            }]}
          >
            <Text style={[styles.label, { color: playing ? palette.onAccent : palette.accent, fontSize: label.length > 3 ? 60 : 72 }]}>{label}</Text>
          </Animated.View>
        </Pressable>
      </View>
      <Text style={[styles.status, playing && { color: palette.accent }]}>{status.toUpperCase()}</Text>
      {playing && (
        <Pressable onPress={onStop} style={[styles.stop, { borderColor: palette.cardLine }]} accessibilityRole="button">
          <Text style={styles.stopText}>STOP</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  halo: { position: 'absolute', borderWidth: 4 },
  button: { borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.display, letterSpacing: 1 },
  status: { fontFamily: fonts.label, color: base.muted, fontSize: 17, letterSpacing: 4, marginTop: 2, textAlign: 'center', paddingHorizontal: 24 },
  stop: { marginTop: 14, borderWidth: 1, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 7 },
  stopText: { fontFamily: fonts.labelBold, color: base.text, fontSize: 15, letterSpacing: 3 },
});
