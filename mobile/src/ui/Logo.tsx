import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { base, fonts } from '../theme';

// NHL and AHL SVGs come in _light (for light backgrounds) and _dark versions.
const forDark = (url: string) => url.replace(/_light\.svg$/, '_dark.svg');

export function Logo({ url, abbrev, size = 64 }: { url: string; abbrev: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: base.panel, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.labelBold, color: base.muted, fontSize: size / 3.2 }}>{abbrev}</Text>
      </View>
    );
  }
  if (/\.svg($|\?)/i.test(url)) {
    return <SvgUri uri={forDark(url)} width={size} height={size} onError={() => setFailed(true)} />;
  }
  return <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setFailed(true)} />;
}
