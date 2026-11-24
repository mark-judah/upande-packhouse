import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/src/core/theme';
import { audio } from '@/src/core/audio';

export type ScanFieldHandle = {
  focus: () => void;
  clear: () => void;
};

type Props = {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onScan: (code: string) => void;
  autoFocus?: boolean;
  editable?: boolean;
  /** Opt INTO the auto-refocus loop. Default off — Android operators don't
   *  want the soft keyboard popping back every time the field blurs. Screens
   *  give an explicit "Next" button to refocus when the user is ready. */
  stickyFocus?: boolean;
  /** Show the OS soft keyboard on focus. Default off — hardware scanners
   *  type via HID without needing the soft keyboard, and suppressing it
   *  removes the popping/jumping behavior on Android. Set true if the
   *  screen also expects manual typed input. */
  showSoftKeyboard?: boolean;
  /** Handle the camera button yourself (e.g. an inline camera inside a sheet, InlineCamera) instead of opening
   *  the full-screen camera, which leaves the page. */
  onCameraPress?: () => void;
  /** With onCameraPress: the camera is showing -- the button reads ✕ to close it. */
  cameraOpen?: boolean;
};

const DEBOUNCE_MS = 300;
const REFOCUS_DELAY_MS = 100;
/** A handheld scanner types a whole code in one fast burst; people type far slower. A burst that then goes
 *  quiet for this long is a finished scan, Enter suffix or not. */
const SCAN_IDLE_MS = 250;
/** Characters arriving closer together than this (or several at once) come from a scanner, not a person. */
const SCANNER_GAP_MS = 60;

export const ScanField = forwardRef<ScanFieldHandle, Props>(function ScanField(
  {
    placeholder = 'Scan or type code',
    value,
    onChangeText,
    onScan,
    autoFocus,
    editable = true,
    stickyFocus = false,
    showSoftKeyboard = false,
    onCameraPress,
    cameraOpen = false,
  },
  ref,
) {
  const inputRef = useRef<TextInputInstance>(null);
  const [internal, setInternal] = useState('');
  const lastScanAt = useRef(0);
  // True while we're applying a programmatic value change (clear after fire,
  // imperative .clear()). The JSON-complete detector must ignore these or it
  // would re-fire on an empty string after a clear.
  const programmaticRef = useRef(false);
  // Set while we're navigating to the camera screen so the sticky-focus loop
  // doesn't fight the nav transition.
  const navigatingAwayRef = useRef(false);
  // Handheld-scanner burst: when the last character came in, whether this input is a scanner burst, and the
  // timer that completes it once the scanner goes quiet.
  const lastKeyAt = useRef(0);
  const burstRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const text = value ?? internal;
  const setText = (next: string) => {
    if (onChangeText) onChangeText(next);
    else setInternal(next);
  };

  const clearProgrammatic = () => {
    programmaticRef.current = true;
    setText('');
    // Release on the next tick so React has applied the empty value before
    // the change handler sees the next character from the scanner.
    setTimeout(() => {
      programmaticRef.current = false;
    }, 0);
  };

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => clearProgrammatic(),
  }));

  const fire = (code: string) => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    const trimmed = code.trim();
    if (!trimmed) return;
    const now = Date.now();
    if (now - lastScanAt.current < DEBOUNCE_MS) return;
    lastScanAt.current = now;
    audio.beep();
    clearProgrammatic();
    onScan(trimmed);
    inputRef.current?.focus();
  };

  const handleChange = (next: string) => {
    const before = text;
    setText(next);
    if (programmaticRef.current) return;
    // A scanner with no Enter suffix (or one whose payload is not valid JSON on this device's keyboard
    // layout) never triggers the checks below: finish its burst once it goes quiet.
    const now = Date.now();
    const added = next.length - before.length;
    const fast = added > 1 || (before.length > 0 && now - lastKeyAt.current < SCANNER_GAP_MS);
    if (!before.length) burstRef.current = added > 1;
    else if (fast) burstRef.current = true;
    else if (added > 0) burstRef.current = false;
    lastKeyAt.current = now;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (next.trim() && (burstRef.current || !showSoftKeyboard)) {
      idleTimer.current = setTimeout(() => {
        idleTimer.current = null;
        fire(next);
      }, SCAN_IDLE_MS);
    }
    // Honeywell-style hardware scanners type characters fast, and some
    // configurations don't emit an Enter suffix — so onSubmitEditing never
    // fires. Detect a complete JSON payload as the scan-complete signal:
    // valid JSON + closing brace means the scanner is done.
    const trimmed = next.trim();
    if (trimmed.endsWith('}')) {
      try {
        JSON.parse(trimmed);
        fire(trimmed);
      } catch {
        // partial buffer — keep accumulating
      }
    }
  };

  const handleBlur = () => {
    if (!stickyFocus || !editable || navigatingAwayRef.current) return;
    // Yank focus back so the operator never has to tap the field. A short
    // delay lets a deliberate focus elsewhere (button press, popup open) win.
    setTimeout(() => {
      if (!stickyFocus || !editable || navigatingAwayRef.current) return;
      inputRef.current?.focus();
    }, REFOCUS_DELAY_MS);
  };

  const openCamera = async () => {
    if (onCameraPress) {
      onCameraPress();
      return;
    }
    navigatingAwayRef.current = true;
    cameraResultCallback = (code: string) => {
      navigatingAwayRef.current = false;
      fire(code);
    };
    router.push('/camera-scanner');
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={handleChange}
        onSubmitEditing={(e) => fire(e.nativeEvent.text)}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        autoFocus={autoFocus}
        editable={editable}
        showSoftInputOnFocus={showSoftKeyboard}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        returnKeyType="done"
        style={styles.input}
      />
      <Pressable onPress={openCamera} style={styles.cameraBtn} disabled={!editable}>
        <MaterialCommunityIcons name={cameraOpen ? 'close' : 'camera-outline'} size={22} color={COLORS.bg} />
      </Pressable>
    </View>
  );
});

// One-shot callback bridge from CameraScannerScreen back to the field.
// Avoids needing a global event bus or context for a single-result pattern.
export let cameraResultCallback: ((code: string) => void) | null = null;
export function consumeCameraResult(code: string) {
  const cb = cameraResultCallback;
  cameraResultCallback = null;
  if (cb) cb(code);
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  cameraBtn: {
    width: 44,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
