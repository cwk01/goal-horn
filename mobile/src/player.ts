// Plays one horn at a time. A new horn stops the one before it.
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { BUILT_IN, HornType, Resolved } from './library';

let current: AudioPlayer | null = null;
let doneTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(playing: HornType | null) => void>();

export function onPlaying(fn: (playing: HornType | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const announce = (v: HornType | null) => listeners.forEach(fn => fn(v));

export async function setupAudio() {
  // Play even with the ringer on silent, and duck music rather than stop it.
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: false, allowsRecording: false });
}

export function stop() {
  if (doneTimer) clearTimeout(doneTimer);
  doneTimer = null;
  if (current) {
    try { current.pause(); current.remove(); } catch (e) { /* already gone */ }
    current = null;
    announce(null);
  }
}

export function play(type: HornType, horn: Resolved, volume = 100) {
  stop();
  const p = createAudioPlayer(horn.uri ? { uri: horn.uri } : BUILT_IN[type]);
  p.volume = Math.max(0, Math.min(1, volume / 100));
  current = p;
  announce(type);
  const sub = p.addListener('playbackStatusUpdate', st => {
    if (st.didJustFinish && current === p) {
      sub.remove();
      stop();
    }
  });
  // Safety net in case the finish event never arrives.
  doneTimer = setTimeout(() => { if (current === p) stop(); }, 3 * 60000);
  p.play();
}
