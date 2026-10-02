import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/src/core/ui/Button';
import { useAuthStore } from '@/src/core/auth/store';
import { authRepository } from '@/src/core/auth/repository';
import {
  instanceKey,
  instanceLabel,
  knownInstances,
  type KnownInstance,
} from '@/src/core/auth/known-instances';
import { useTenant } from '@/src/core/tenant/tenant-context';
import { storage, StorageKeys } from '@/src/core/storage';
import * as Biometric from '@/src/core/biometric';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { APP_VERSION } from '@/src/core/version';

const APP_NAME = 'Upande Packhouse';
const HOME_ROUTE = '/home';
const LOGO = require('@/assets/upande_logo.png');

/**
 * Two steps, the same shape as Upande Sensors:
 *
 *   1. Instance — pick one this device has signed in to before, or type a new
 *      URL. Shown first on a fresh install, and again via "Change".
 *   2. Credentials — or, when biometric unlock is set up for the chosen
 *      instance, a single "Sign in with fingerprint" card.
 *
 * The credential fields are hidden while the instance is being changed: which
 * server the password goes to is exactly what is in flux.
 */
export default function Login() {
  const login = useAuthStore((s) => s.login);
  const biometricLogin = useAuthStore((s) => s.biometricLogin);
  const { setInstanceUrl } = useTenant();

  const [ready, setReady] = useState(false);
  const [instances, setInstances] = useState<KnownInstance[]>([]);
  const [url, setUrl] = useState('');
  const [instanceOpen, setInstanceOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Biometric re-login replays the saved password against the instance it was
  // saved for, so it is only offered while that instance is the selected one.
  const [bioUrl, setBioUrl] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const bioAvailable = !!bioUrl && instanceKey(bioUrl) === instanceKey(url);
  // Who signs in here, by name; the email until that instance has a saved name.
  const accountName =
    instances.find((i) => instanceKey(i.url) === instanceKey(url))?.fullName || email;
  const biometricOnly = bioAvailable && !usePassword && !instanceOpen;

  useEffect(() => {
    (async () => {
      const [{ email: e, url: u }, list, pw, bioFlag] = await Promise.all([
        authRepository.loadBackupCredentials(),
        knownInstances.list(),
        storage.get(StorageKeys.passwordBackup),
        storage.get(StorageKeys.biometricEnabled),
      ]);
      setInstances(list);
      const current = u ?? list[0]?.url ?? '';
      setUrl(current);
      setEmail(e ?? list[0]?.email ?? '');
      // No instance yet: the instance form is the first thing shown.
      if (!current) setInstanceOpen(true);
      if (u && pw && bioFlag === '1' && Biometric.isModuleAvailable()) setBioUrl(u);
      setReady(true);
    })();
  }, []);

  const finish = useCallback(async () => {
    const stored = useAuthStore.getState().instanceUrl;
    await setInstanceUrl(stored ?? null);
    router.replace(HOME_ROUTE);
  }, [setInstanceUrl]);

  const onBiometric = useCallback(async () => {
    setBioBusy(true);
    setErr(null);
    try {
      const res = await biometricLogin();
      if (res.ok) {
        await finish();
        return;
      }
      if (res.reason === 'cancelled') return;
      if (res.reason === 'no_credentials') {
        setErr('No saved credentials — sign in with your password once to enable biometrics.');
        setUsePassword(true);
        return;
      }
      setErr(res.message ?? "Couldn't verify biometric. Use your password.");
    } finally {
      setBioBusy(false);
    }
  }, [biometricLogin, finish]);

  // Offer the prompt straight away — tapping a button first is an extra step
  // for the common case. Once per visit to the screen.
  const autoPrompted = useRef(false);
  useEffect(() => {
    if (!ready || !biometricOnly || autoPrompted.current) return;
    autoPrompted.current = true;
    onBiometric();
  }, [ready, biometricOnly, onBiometric]);

  const selectInstance = (inst: { url: string; email?: string | null }) => {
    setUrl(inst.url);
    if (inst.email) setEmail(inst.email);
    setPassword('');
    setErr(null);
    setInstanceOpen(false);
  };

  const openInstanceEditor = () => {
    setDraftUrl('');
    setErr(null);
    setInstanceOpen(true);
  };

  const continueWithDraft = () => {
    const typed = draftUrl.trim();
    if (!typed) return;
    const known = instances.find((i) => instanceKey(i.url) === instanceKey(typed));
    selectInstance(known ?? { url: typed });
  };

  const removeInstance = (inst: KnownInstance) => {
    Alert.alert('Remove instance?', `${instanceLabel(inst.url)} will no longer be suggested here.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => setInstances(await knownInstances.forget(inst.url)),
      },
    ]);
  };

  const submit = async () => {
    if (!url.trim()) {
      setInstanceOpen(true);
      return;
    }
    if (!email.trim() || !password) {
      setErr('Email and password are required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const ok = await login(email.trim(), password, url);
    setSubmitting(false);
    if (ok) await finish();
    else setErr(useAuthStore.getState().error ?? 'Login failed');
  };

  if (!ready) return <SafeAreaView style={s.safe} />;

  const errorBanner = err ? (
    <View style={s.errBox}>
      <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} style={{ marginTop: 1 }} />
      <Text style={s.errText}>{err}</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={40}
      >
        <View style={s.brand}>
          <Image source={LOGO} style={s.logo} resizeMode="contain" />
          <Text style={s.appName}>{APP_NAME}</Text>
          {!instanceOpen && url ? (
            <Pressable onPress={openInstanceEditor} hitSlop={8} style={s.instancePill}>
              <Ionicons name="server-outline" size={14} color={COLORS.textSecondary} />
              <Text style={s.instancePillText} numberOfLines={1}>
                {instanceLabel(url)}
              </Text>
              <Text style={s.instancePillAction}>Change</Text>
            </Pressable>
          ) : null}
        </View>

        {instanceOpen ? (
          <View style={s.card}>
            {instances.length > 0 ? (
              <>
                <Text style={s.label}>Previously used</Text>
                {instances.map((inst) => {
                  const selected = instanceKey(inst.url) === instanceKey(url);
                  return (
                    <Pressable
                      key={inst.url}
                      onPress={() => selectInstance(inst)}
                      onLongPress={() => removeInstance(inst)}
                      style={({ pressed }) => [
                        s.instanceRow,
                        selected && s.instanceRowSelected,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={selected ? COLORS.primary : COLORS.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.instanceHost} numberOfLines={1}>
                          {instanceLabel(inst.url)}
                        </Text>
                        {inst.fullName || inst.email ? (
                          <Text style={s.instanceEmail} numberOfLines={1}>
                            {inst.fullName || inst.email}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable onPress={() => removeInstance(inst)} hitSlop={10}>
                        <Ionicons name="close" size={18} color={COLORS.textMuted} />
                      </Pressable>
                    </Pressable>
                  );
                })}
                <Text style={[s.label, { marginTop: spacing.lg }]}>Or add another</Text>
              </>
            ) : (
              <Text style={s.label}>Instance URL</Text>
            )}
            <TextInput
              value={draftUrl}
              onChangeText={setDraftUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="your-site.upande.com"
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="go"
              onSubmitEditing={continueWithDraft}
              style={s.input}
            />
            <View style={s.actions}>
              {/* No Cancel without an instance: there is nothing to go back to. */}
              {url ? (
                <Button
                  label="Cancel"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => setInstanceOpen(false)}
                />
              ) : null}
              <Button
                label="Continue"
                style={{ flex: 1 }}
                onPress={continueWithDraft}
                disabled={!draftUrl.trim()}
              />
            </View>
          </View>
        ) : biometricOnly ? (
          <>
            {errorBanner}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in with biometrics"
              onPress={onBiometric}
              disabled={bioBusy}
              style={({ pressed }) => [s.bioCard, { opacity: bioBusy ? 0.6 : pressed ? 0.85 : 1 }]}
            >
              <View style={s.bioIcon}>
                <Ionicons name="finger-print" size={34} color={COLORS.text} />
              </View>
              <Text style={s.bioLabel}>{bioBusy ? 'Waiting…' : 'Sign in with biometrics'}</Text>
              {accountName ? <Text style={s.bioEmail}>{accountName}</Text> : null}
            </Pressable>
            <Pressable
              onPress={() => {
                setErr(null);
                setUsePassword(true);
              }}
              style={s.switchLink}
            >
              <Text style={s.switchLinkText}>Use password instead</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={s.card}>
              <Text style={s.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (err) setErr(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                placeholder="you@upande.com"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="next"
                style={[s.input, { marginBottom: spacing.md }]}
              />
              <Text style={s.label}>Password</Text>
              <View style={s.pwRow}>
                <TextInput
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (err) setErr(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  style={s.pwInput}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Text style={s.pwToggle}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
            </View>
            {errorBanner}
            <Button label="Sign in" onPress={submit} loading={submitting} />
            {bioAvailable ? (
              <Pressable
                onPress={() => {
                  setErr(null);
                  setUsePassword(false);
                }}
                style={s.switchLink}
              >
                <Text style={s.switchLinkText}>Use biometrics instead</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Text style={s.version}>v{APP_VERSION}</Text>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bgMuted },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { width: 76, height: 76, marginBottom: spacing.lg },
  appName: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: COLORS.text, textAlign: 'center' },
  instancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    maxWidth: '100%',
  },
  instancePillText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, flexShrink: 1 },
  instancePillAction: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.primary, marginLeft: spacing.xs },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  instanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: spacing.sm,
  },
  instanceRowSelected: { borderColor: COLORS.primary },
  instanceHost: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  instanceEmail: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.sm,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 10,
  },
  pwInput: { flex: 1, fontSize: fontSize.md, color: COLORS.text, paddingVertical: 10 },
  pwToggle: { color: COLORS.text, fontSize: fontSize.sm, fontWeight: '600', padding: 6 },
  errBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: '#FEF2F2',
    marginBottom: spacing.lg,
  },
  errText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#991B1B', lineHeight: 19 },
  bioCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  bioIcon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: COLORS.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  bioEmail: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: -spacing.sm },
  switchLink: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  switchLinkText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.primary },
  version: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
