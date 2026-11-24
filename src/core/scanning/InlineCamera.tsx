import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, fontSize, radius, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { audio } from '@/src/core/audio';

const BARCODE_TYPES = ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'pdf417', 'datamatrix'] as const;

/** A camera scanner that fills the space it is given — e.g. above a bottom sheet
 *  (BottomSheet `top`), so scanning never leaves the sheet the way the full-screen
 *  camera route does. One code per opening; the parent closes it in `onScan`. */
export function InlineCamera({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  // Stop reading codes first, hand the code over a beat later: unmounting the camera
  // in the same tick it reports a code rejected expo-camera's pending scan promise
  // ("Uncaught (in promise)").
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (done == null) return;
    const t = setTimeout(() => onScan(done), 150);
    return () => clearTimeout(t);
  }, [done, onScan]);

  if (!permission) return <View style={styles.box} />;
  if (!permission.granted) {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.permissionText}>Camera access is required to scan.</Text>
        <Button label="Grant access" onPress={() => void requestPermission().catch(() => {})} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={
          done != null
            ? undefined
            : ({ data }) => {
                if (handled.current || !data) return;
                handled.current = true;
                audio.beep();
                setDone(data.trim());
              }
        }
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Point at the QR code</Text>
      </View>
      <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close camera">
        <Ionicons name="close" size={24} color={'#fff'} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  frame: { width: 240, height: 160, borderColor: '#fff', borderWidth: 2, borderRadius: radius.md },
  hint: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#fff' },
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
  permissionText: { fontFamily: fontFamily.regular, color: '#fff', fontSize: fontSize.sm, textAlign: 'center' },
});
