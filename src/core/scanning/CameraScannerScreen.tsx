import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { consumeCameraResult } from './ScanField';

export function CameraScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [, setBusy] = useState(false);
  const handled = useRef(false);

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

  const onBarcode = (data: string) => {
    if (handled.current) return;
    handled.current = true;
    setBusy(true);
    consumeCameraResult(data);
    router.back();
  };

  return (
    <View style={styles.black}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'pdf417', 'datamatrix'],
        }}
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
    ...StyleSheet.absoluteFillObject,
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
