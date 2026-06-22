import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';

/** One-shot callback bridge that lets the caller receive the captured photo
 *  URI. Set right before navigating; cleared on consume. */
let captureResultCallback: ((uri: string) => void) | null = null;
export function setCaptureResultCallback(cb: ((uri: string) => void) | null) {
  captureResultCallback = cb;
}
export function consumeCaptureResult(uri: string) {
  const cb = captureResultCallback;
  captureResultCallback = null;
  if (cb) cb(uri);
}

export function CameraCaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  if (!permission) return <View style={s.black} />;

  if (!permission.granted) {
    return (
      <View style={[s.black, s.center]}>
        <Text style={s.permissionText}>Camera access is required to capture photos.</Text>
        <Button label="Grant access" onPress={() => requestPermission()} />
        <Pressable onPress={() => router.back()} style={s.linkBtn}>
          <Text style={s.link}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const takePicture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });
      if (photo?.uri) {
        consumeCaptureResult(photo.uri);
        router.back();
        return;
      }
    } catch {
      // fall through to busy reset
    }
    setBusy(false);
  };

  return (
    <View style={s.black}>
      <CameraView ref={cameraRef} style={s.camera} facing="back" mode="picture" />
      <Pressable onPress={() => router.back()} style={s.closeBtn}>
        <Ionicons name="close" size={28} color="#FFFFFF" />
      </Pressable>
      <View style={s.shutterBar} pointerEvents="box-none">
        <Pressable onPress={takePicture} disabled={busy} style={s.shutterBtn}>
          <View style={[s.shutterInner, busy && { opacity: 0.5 }]} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  camera: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    top: 48, right: 16,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shutterBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBtn: {
    width: 76, height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shutterInner: {
    width: 60, height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  permissionText: {
    color: '#FFFFFF',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  linkBtn: { padding: spacing.sm },
  link: {
    color: '#FFFFFF',
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
});

