import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
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
};

const DEBOUNCE_MS = 300;
const REFOCUS_DELAY_MS = 100;

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
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [internal, setInternal] = useState('');
  const lastScanAt = useRef(0);
  // True while we're applying a programmatic value change (clear after fire,
  // imperative .clear()). The JSON-complete detector must ignore these or it
  // would re-fire on an empty string after a clear.
  const programmaticRef = useRef(false);
  // Set while we're navigating to the camera screen so the sticky-focus loop
  // doesn't fight the nav transition.
  const navigatingAwayRef = useRef(false);

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
    setText(next);
    if (programmaticRef.current) return;
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
        <MaterialCommunityIcons name="camera-outline" size={22} color={COLORS.bg} />
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
