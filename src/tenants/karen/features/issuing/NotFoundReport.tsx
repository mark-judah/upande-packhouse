import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/core/ui/Button';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { InlineCamera } from '@/src/core/scanning/InlineCamera';
import { InlinePhoto } from '@/src/core/scanning/InlinePhoto';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { uploadImage } from '@/src/core/api/upload';
import { storage, StorageKeys } from '@/src/core/storage';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { karenIssuingApi } from '@/src/tenants/karen/api/karen-issuing-api';
import type { NotFoundReport as Report, NotFoundReportInfo } from '@/src/tenants/karen/state/karen-issuing-store';

/** The cameras open inside the sheet, this tall. */
const CAMERA_HEIGHT = 280;
/** A shelf check that has not answered by then is given up: scan again. */
const CHECK_TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * A bucket being reported (missing, damaged, wrong variety, issued offline): scan the shelf the system put it on,
 * then photograph that shelf. Only then can it be replaced, marked not found or marked issued -- the shelf and photo
 * go on the record. A different shelf is refused. A Honeywell scanner types into the shelf field, which holds the
 * focus (on opening, after every check, when a camera closes); the phone camera opens inside the sheet.
 */
export function NotFoundReportSteps({
  oplName,
  bucket: bucketId,
  saleOrderItem,
  shelfHint,
  onReady,
}: {
  oplName: string;
  bucket: string;
  saleOrderItem?: string;
  /** The shelf the phone has for the bucket (the server's is the one checked). */
  shelfHint?: string;
  /** The finished report, or null while a step is missing. */
  onReady: (report: Report | null) => void;
}) {
  const scanRef = useRef<ScanFieldHandle>(null);
  const busy = useRef(false);
  const [shelf, setShelf] = useState('');
  const [expected, setExpected] = useState((shelfHint || '').toUpperCase());
  const [shelfError, setShelfError] = useState('');
  const [checking, setChecking] = useState(false);
  const [camera, setCamera] = useState<'scan' | 'photo' | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  // the shelf field takes the Honeywell scan: focused whenever a shelf is still to be scanned
  useEffect(() => {
    if (!shelf && camera !== 'scan') focusWhenReady(scanRef);
  }, [shelf, camera]);

  const onShelfScan = async (raw: string) => {
    setCamera(null);
    scanRef.current?.clear();
    const code = raw.trim();
    if (!code || busy.current) return;
    busy.current = true;
    setChecking(true);
    setShelfError('');
    try {
      const r = await withTimeout(
        karenIssuingApi.checkNotFoundShelf({
          opl_name: oplName,
          bucket: bucketId,
          sale_order_item: saleOrderItem,
          scan: code,
        }),
        CHECK_TIMEOUT_MS,
        'No reply from the server. Scan the shelf again.',
      );
      if (r.expected) setExpected(r.expected);
      if (r.ok) {
        setShelf(r.shelf ?? '');
        onReady(photo ? { shelf: r.shelf ?? '', photo: photo.url } : null);
      } else {
        setShelfError(r.message || 'Could not check the shelf. Scan it again.');
      }
    } catch (e) {
      setShelfError((e as Error)?.message || 'Could not check the shelf. Scan it again.');
    } finally {
      busy.current = false;
      setChecking(false);
      focusWhenReady(scanRef);
    }
  };

  const onPhoto = async (uri: string) => {
    setCamera(null);
    setUploading(true);
    setPhotoError('');
    try {
      const f = await uploadImage(uri, `shelf-${shelf || expected || 'x'}-${bucketId}.jpg`);
      setPhoto({ uri, url: f.file_url });
      onReady(shelf ? { shelf, photo: f.file_url } : null);
    } catch (e) {
      setPhoto(null);
      onReady(null);
      setPhotoError((e as Error)?.message || 'The photo did not upload. Take it again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={s.box}>
      <View style={s.step}>
        <StepMark done={!!shelf} n={1} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={s.stepTitle}>{shelf ? `Shelf ${shelf}` : `Scan shelf ${expected}`.trim()}</Text>
          {!shelf ? (
            <>
              {camera === 'scan' ? (
                <View style={s.camera}>
                  <InlineCamera onScan={(code) => void onShelfScan(code)} onClose={() => setCamera(null)} />
                </View>
              ) : null}
              <ScanField
                ref={scanRef}
                autoFocus
                placeholder={checking ? 'Checking…' : 'Scan the shelf QR'}
                onScan={(code) => void onShelfScan(code)}
                onCameraPress={() => setCamera((c) => (c === 'scan' ? null : 'scan'))}
                cameraOpen={camera === 'scan'}
              />
              {shelfError ? <Text style={s.error}>{shelfError}</Text> : null}
            </>
          ) : null}
        </View>
      </View>

      <View style={[s.step, !shelf && s.stepOff]}>
        <StepMark done={!!photo} n={2} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={s.stepTitle}>Photo of the shelf</Text>
          {camera === 'photo' ? (
            <View style={s.camera}>
              <InlinePhoto onTaken={(uri) => void onPhoto(uri)} onClose={() => setCamera(null)} />
            </View>
          ) : photo ? (
            <Pressable onPress={() => setCamera('photo')} style={s.photoRow} accessibilityLabel="Retake the photo">
              <Image source={{ uri: photo.uri }} style={s.thumb} />
              <Text style={s.retake}>Retake</Text>
            </Pressable>
          ) : (
            <Button
              size="sm"
              variant="outline"
              singleLine
              iconLeft="camera-outline"
              label={uploading ? 'Uploading…' : 'Take photo'}
              loading={uploading}
              disabled={!shelf || uploading}
              onPress={() => setCamera('photo')}
            />
          )}
          {photoError ? <Text style={s.error}>{photoError}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/** The not-found report of a bucket (the farm's, or the issuer's): where, who, when, and the shelf photo. */
export function NotFoundReportCard({ report }: { report: NotFoundReportInfo }) {
  const [base, setBase] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    storage.get(StorageKeys.instanceUrl).then((u) => live && setBase((u || '').replace(/\/+$/, '')));
    return () => {
      live = false;
    };
  }, []);
  const src = report.photo && base ? { uri: /^https?:/.test(report.photo) ? report.photo : base + report.photo } : null;
  const when = report.at ? report.at.slice(0, 16).replace('T', ' ') : '';
  return (
    <View style={s.card}>
      {src ? (
        <Pressable onPress={() => setOpen(true)} accessibilityLabel="Open the shelf photo">
          <Image source={src} style={s.cardThumb} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>
          {report.replacedBy && report.bucket !== report.replacedBy
            ? `Replaces ${report.bucket.toUpperCase()}, ${reasonText(report.reason)}`
            : reasonText(report.reason, true)}
          {report.farm ? ` at ${report.farm}` : ''}
        </Text>
        <Text style={s.cardMeta} numberOfLines={2}>
          {[report.shelf ? `shelf ${report.shelf}` : '', report.by, when].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {src ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.full} onPress={() => setOpen(false)}>
            <Image source={src} style={s.fullImg} resizeMode="contain" />
            <Ionicons name="close" size={28} color="#fff" style={s.fullClose} />
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

/** "not found" for a missing bucket, else the reason, lower case after a comma. */
function reasonText(reason: string, first = false): string {
  const t = !reason || reason === 'Missing' ? 'not found' : reason.toLowerCase();
  return first ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function StepMark({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
  ) : (
    <View style={s.num}>
      <Text style={s.numText}>{n}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: spacing.sm,
  },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepOff: { opacity: 0.45 },
  stepTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text, marginTop: 2 },
  camera: { height: CAMERA_HEIGHT },
  num: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { fontFamily: fontFamily.bold, fontSize: 12, color: COLORS.text },
  error: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.danger },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: borderRadius.sm, backgroundColor: COLORS.border },
  retake: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: '#FEF2F2',
  },
  cardThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: COLORS.border },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.xs, color: COLORS.danger },
  cardMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  full: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fullImg: { width: '100%', height: '80%' },
  fullClose: { position: 'absolute', top: 48, right: 20 },
});
