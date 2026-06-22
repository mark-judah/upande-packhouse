import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const sources = {
  beep: require('@/assets/beep.mp3'),
  submit: require('@/assets/submit.mp3'),
  error: require('@/assets/error.mp3'),
} as const;

type SoundKey = keyof typeof sources;

const players: Partial<Record<SoundKey, AudioPlayer>> = {};

function getPlayer(key: SoundKey): AudioPlayer {
  let p = players[key];
  if (!p) {
    p = createAudioPlayer(sources[key]);
    players[key] = p;
  }
  return p;
}

function play(key: SoundKey) {
  try {
    const p = getPlayer(key);
    p.seekTo(0);
    p.play();
  } catch {
    // sound is non-critical
  }
}

export const audio = {
  beep: () => play('beep'),
  submit: () => play('submit'),
  error: () => play('error'),
};
