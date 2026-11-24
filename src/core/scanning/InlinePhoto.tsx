import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';

/** A photo camera that fills the space it is given -- inside a sheet or dialog, so taking the photo never leaves
 *  it the way the full-screen camera route does. `onTaken` gets the photo's local uri. */
export function InlinePhoto({ onTaken, onClose }: { onTaken: (uri: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  if (!permission) return <View style={s.box} />;
  if (!permission.granted) {
    return (
      <View style={[s.box, s.center]}>
        <Text style={s.permissionText}>Camera access is required to take the photo.</Text>
        <Button label="Grant access" onPress={() => void requestPermission().catch(() => {})} />
      </View>
    );
  }

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) {
        onTaken(photo.uri);
        return;
      }
    } catch {
      // stays open to try again
    }
    setBusy(false);
  };

  return (
    <View style={s.box}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" mode="picture" />
      <Pressable onPress={onClose} style={s.closeBtn} hitSlop={8} accessibilityLabel="Close camera">
        <Ionicons name="close" size={24} color="#fff" />
      </Pressable>
      <View style={s.shutterBar} pointerEvents="box-none">
        <Pressable onPress={shoot} disabled={busy} style={s.shutter} accessibilityLabel="Take the photo">
          <View style={[s.shutterInner, busy && { opacity: 0.5 }]} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  permissionText: { fontFamily: fontFamily.regular, color: '#fff', fontSize: fontSize.sm, textAlign: 'center' },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shutterBar: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff' },
});
