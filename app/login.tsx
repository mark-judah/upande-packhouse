import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/core/ui/Screen';
import { Card } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { useAuthStore } from '@/src/core/auth/store';
import { authRepository } from '@/src/core/auth/repository';
import { useTenant } from '@/src/core/tenant/tenant-context';
import { storage, StorageKeys } from '@/src/core/storage';
import * as Biometric from '@/src/core/biometric';
import { COLORS, borderRadius, shadow, spacing } from '@/src/core/theme';
import { APP_VERSION } from '@/src/core/version';

export default function Login() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);
  const biometricLogin = useAuthStore((s) => s.biometricLogin);
  const { setInstanceUrl } = useTenant();

  // Biometric login is available when:
  //   - we have a saved password from a previous password login, AND
  //   - the biometric_enabled flag was turned on in Settings, AND
  //   - the native biometric module is present in the running binary
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { email: e, url: u } = await authRepository.loadBackupCredentials();
      if (e) setEmail(e);
      if (u) setUrl(u.replace(/^https?:\/\//i, ''));

      const [pw, bioFlag] = await Promise.all([
        storage.get(StorageKeys.passwordBackup),
        storage.get(StorageKeys.biometricEnabled),
      ]);
      setBioAvailable(!!pw && bioFlag === '1' && Biometric.isModuleAvailable());
    })();
  }, []);

  const onBiometric = async () => {
    setBioBusy(true);
    setErr(null);
    try {
      const res = await biometricLogin();
      if (res.ok) {
        const stored = useAuthStore.getState().instanceUrl;
        await setInstanceUrl(stored ?? null);
        router.replace('/issuing');
        return;
      }
      if (res.reason === 'cancelled') return;
      if (res.reason === 'no_credentials') {
        setErr('No saved credentials — sign in with your password once to enable biometrics.');
        return;
      }
      setErr(res.message ?? "Couldn't verify biometric. Use your password.");
    } finally {
      setBioBusy(false);
    }
  };

  const submit = async () => {
    if (!url.trim()) {
      setErr('Instance URL is required.');
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
    if (ok) {
      const stored = useAuthStore.getState().instanceUrl;
      await setInstanceUrl(stored ?? null);
      router.replace('/issuing');
    } else {
      setErr(useAuthStore.getState().error ?? 'Login failed');
    }
  };

  return (
    <Screen title="Upande Packhouse" hideMenu>
      <Card>
        <Text style={s.intro}>Sign in with your Frappe user account.</Text>
      </Card>

      <Card>
        <Field
          label="Instance URL"
          value={url}
          onChange={setUrl}
          placeholder="demo.upande.com"
          keyboardType="url"
        />
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          keyboardType="email-address"
        />
        <View style={s.pwWrap}>
          <Text style={s.label}>Password</Text>
          <View style={s.pwRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              style={s.pwInput}
              placeholder="••••••••"
              placeholderTextColor={COLORS.textMuted}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Text style={s.pwToggle}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
        </View>
        {err ? <Text style={s.err}>{err}</Text> : null}
      </Card>

      <Button label="Sign in" onPress={submit} loading={submitting} />

      {bioAvailable ? (
        <TouchableOpacity
          onPress={onBiometric}
          disabled={bioBusy}
          activeOpacity={0.8}
          style={s.bioFab}
        >
          {bioBusy ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Ionicons name="finger-print" size={28} color={COLORS.text} />
          )}
        </TouchableOpacity>
      ) : null}

      <View style={s.footer}>
        <Text style={s.version}>v{APP_VERSION}</Text>
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'url';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        style={s.input}
      />
    </View>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 14, color: COLORS.text },
  label: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  pwWrap: { marginBottom: 10 },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 10,
  },
  pwInput: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 10 },
  pwToggle: { color: COLORS.text, fontSize: 13, fontWeight: '600', padding: 6 },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 4 },
  footer: { alignItems: 'center', paddingTop: 24 },
  version: { fontSize: 11, color: COLORS.textMuted },
  bioFab: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
});
