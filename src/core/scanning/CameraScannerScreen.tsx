import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { consumeCameraResult } from './ScanField';

const BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'pdf417', 'datamatrix'];

/** How often a full-resolution still is taken and decoded while the live
 *  preview has not found a code: a small or soft-printed QR the preview frames
 *  miss is usually readable in a still. */
const STILL_SCAN_MS = 1500;

export function CameraScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [, setBusy] = useState(false);
  const handled = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const onBarcode = useCallback((data: string) => {
    if (handled.current) return;
    handled.current = true;
    setBusy(true);
    consumeCameraResult(data);
    router.back();
  }, []);

  useEffect(() => {
    if (!cameraReady) return;
    let stopped = false;
    let running = false;
    const timer = setInterval(async () => {
      if (stopped || running || handled.current || !cameraRef.current) return;
      running = true;
      let uri: string | null = null;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, shutterSound: false });
        uri = photo?.uri ?? null;
        if (!uri || stopped || handled.current) return;
        const found = await scanFromURLAsync(uri, BARCODE_TYPES);
        const data = found.find((b) => b.data)?.data;
        if (data && !stopped) onBarcode(data);
      } catch {
        // The live preview keeps scanning; the next still is tried shortly.
      } finally {
        running = false;
        if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }, STILL_SCAN_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [cameraReady, onBarcode]);

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <View style={[styles.black, styles.center]}>
        <Text style={styles.permissionText}>Camera access is required to scan.</Text>
        <Button label="Grant access" onPress={() => requestPermission()} />
        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      </View>
    );
  }


  return (
    <View style={styles.black}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={({ data }) => onBarcode(data)}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
      </View>
      <Pressable onPress={() => router.back()} style={styles.closeBtn}>
        <Ionicons name="close" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const FRAME_W = 280;
const FRAME_H = 180;

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: colors.black },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderColor: colors.white,
    borderWidth: 2,
    borderRadius: radius.md,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 44, height: 44,
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  permissionText: { color: colors.white, fontSize: 16, textAlign: 'center', marginBottom: spacing.md },
  linkBtn: { padding: spacing.sm },
  link: { color: colors.white, fontSize: 14, textDecorationLine: 'underline' },
});
