// Faint center-ice markings behind everything, in the team color.
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { alpha } from '../theme';

export function Rink({ accent }: { accent: string }) {
  const { width, height } = useWindowDimensions();
  const cx = width / 2, cy = 300;
  const grid: number[] = [];
  for (let y = 120; y < height; y += 120) grid.push(y);
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Circle cx={cx} cy={cy} r={width * 0.9} stroke={alpha(accent, 0.07)} strokeWidth={1.5} fill="none" />
      <Circle cx={cx} cy={cy} r={width * 0.62} stroke={alpha(accent, 0.05)} strokeWidth={1} fill="none" />
      {grid.map(y => <Line key={y} x1={0} x2={width} y1={y} y2={y} stroke={alpha('#FFFFFF', 0.025)} strokeWidth={1} />)}
    </Svg>
  );
}
