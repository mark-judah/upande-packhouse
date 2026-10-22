import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/core/ui/Screen';
import { Card } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { Segmented } from '@/src/core/ui/Segmented';
import { useAuthStore } from '@/src/core/auth/store';
import { mapAxiosError } from '@/src/core/api/client';
import {
  fetchInstalls,
  mergeInstallRows,
  parseServerTime,
  type InstallRow,
  type InstallsReply,
  type InstallStatus,
} from '@/src/core/version/devices-api';
import { APP_NAME_FOR_REGISTER, getInstallId, getRegisteredRowId } from '@/src/core/version/install-register';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';

/**
 * The device register: each device running this app, the build it runs, every
 * account that has used it (each on its own last version) and what the server
 * says it should update to. System Managers only.
 * A row's status and "update to" are the server's; nothing is worked out here.
 *
 * Timestamps come in the site's timezone without an offset, so "x ago" is
 * measured against the same response's `server_time`, not the phone's clock.
 */

const PAGE_SIZE = 30;
/** The server's cap; a search reads this many and filters them here. */
const SEARCH_SIZE = 500;

type Window = '0' | '7' | '30';

const STATUS: Record<InstallStatus, { label: string; fg: string; bg: string }> = {
  current: { label: 'Current', fg: '#166534', bg: '#DCFCE7' },
  behind_ota: { label: 'Behind', fg: '#92400E', bg: '#FEF3C7' },
  needs_apk: { label: 'Needs APK', fg: '#991B1B', bg: '#FEE2E2' },
  ahead: { label: 'Ahead', fg: '#1E40AF', bg: '#DBEAFE' },
  dormant: { label: 'Dormant', fg: COLORS.textSecondary, bg: COLORS.surfaceAlt },
  unknown: { label: 'Unknown', fg: COLORS.textSecondary, bg: COLORS.surfaceAlt },
};

function ago(ts: string | null | undefined, serverNow: string | null | undefined): string {
  const t = parseServerTime(ts);
  const now = parseServerTime(serverNow) ?? Date.now();
  if (t == null) return '—';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 60 ? `${days}d ago` : (ts ?? '').slice(0, 10);
}

function matches(r: InstallRow, q: string): boolean {
  const hay = [
    r.full_name,
    r.user,
    r.device_name,
    r.device_brand,
    r.device_model,
    r.os_version,
    r.app_version,
    r.ip_address,
    r.app,
    ...(r.users ?? []).flatMap((u) => [u.full_name, u.user, u.app_version]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default function DevicesScreen() {
  const isManager = useAuthStore((s) => s.roles.includes('System Manager'));
  return isManager ? <DevicesRegister /> : <Redirect href="/settings" />;
}

function DevicesRegister() {
  const [days, setDays] = useState<Window>('0');
  const [dormant, setDormant] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const [data, setData] = useState<InstallsReply | null>(null);
  const [rows, setRows] = useState<InstallRow[]>([]);
  // Rows read from the server so far (the next page's start); `rows` can be
  // fewer once an install that moved between pages is counted once.
  const [fetched, setFetched] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myInstallId, setMyInstallId] = useState<string | null>(null);
  const [myRowId, setMyRowId] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    getInstallId().then(setMyInstallId).catch(() => {});
    getRegisteredRowId().then(setMyRowId).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const key = `${days}|${dormant ? 1 : 0}|${query ? 'q' : ''}`;

  const load = useCallback(
    async (more: boolean) => {
      const mine = ++seq.current;
      if (more) setLoadingMore(true);
      try {
        const res = await fetchInstalls({
          app: APP_NAME_FOR_REGISTER,
          since_days: Number(days) || undefined,
          include_dormant: dormant,
          start: more ? fetched : 0,
          page_length: query ? SEARCH_SIZE : PAGE_SIZE,
        });
        if (mine !== seq.current) return;
        setData(res);
        setRows((prev) => mergeInstallRows(more ? prev : [], res.rows));
        setFetched((prev) => (more ? prev : 0) + res.rows.length);
        setError(null);
      } catch (err) {
        if (mine !== seq.current) return;
        setError(mapAxiosError(err).message);
      } finally {
        if (mine === seq.current) {
          setSettledKey(key);
          setLoadingMore(false);
        }
      }
    },
    [days, dormant, query, fetched, key],
  );

  // From the top whenever a filter changes (`load` also changes with `fetched`).
  useEffect(() => {
    const t = setTimeout(() => load(false), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loading = settledKey !== key;
  const shown = query ? rows.filter((r) => matches(r, query)) : rows;
  const hasMore = !query && fetched < (data?.total ?? 0);
  // Searching filters here, so the count is what is shown.
  const count = query ? shown.length : (data?.total ?? 0);
  const byStatus = data?.by_status ?? {};

  return (
    <Screen
      title="Devices"
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={() => load(false)}
      onRefresh={() => load(false)}
    >
      <Card>
        <Segmented<Window>
          value={days}
          onChange={setDays}
          options={[
            { value: '0', label: 'All' },
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
          ]}
        />
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="User, device or version"
              placeholderTextColor={COLORS.textMuted}
              style={s.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => setDormant((d) => !d)} style={[s.chip, dormant && s.chipOn]}>
            <Text style={[s.chipText, dormant && s.chipTextOn]}>Dormant</Text>
          </Pressable>
        </View>
        {data ? (
          <View style={s.counts}>
            {(Object.keys(STATUS) as InstallStatus[])
              .filter((st) => byStatus[st])
              .map((st) => (
                <StatusBadge key={st} status={st} count={byStatus[st]} />
              ))}
          </View>
        ) : null}
      </Card>

      <Card title={data ? `${count} ${count === 1 ? 'device' : 'devices'}` : 'Devices'}>
        {error && data ? <Text style={s.errorText}>{error}</Text> : null}
        {!shown.length && !loading ? <Text style={s.empty}>No devices</Text> : null}
        {shown.map((r) => (
          <DeviceRow key={r.install_id} row={r} serverNow={data?.server_time} mine={r.install_id === myInstallId || r.install_id === myRowId} />
        ))}
        {hasMore ? (
          <Button
            label={`Show more (${fetched} of ${data?.total ?? 0})`}
            variant="ghost"
            onPress={() => load(true)}
            loading={loadingMore}
            style={s.more}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

function StatusBadge({ status, count }: { status: InstallStatus; count?: number }) {
  const st = STATUS[status] ?? STATUS.unknown;
  return (
    <View style={[s.badge, { backgroundColor: st.bg }]}>
      <Text style={[s.badgeText, { color: st.fg }]}>
        {st.label}
        {count != null ? ` ${count}` : ''}
      </Text>
    </View>
  );
}

function DeviceRow({ row, serverNow, mine }: { row: InstallRow; serverNow?: string; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const model = [row.device_brand, row.device_model].filter(Boolean).join(' ') || 'Unknown device';
  const name = row.device_name && row.device_name !== row.device_model ? row.device_name : model;
  const os = `${row.platform ?? ''} ${row.os_version ?? ''}`.trim();
  const users = row.users ?? [];
  const userCount = row.user_count ?? users.length;
  const lastUser = row.full_name || row.user || 'No user';
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
      <Ionicons
        name={row.is_physical_device ? 'phone-portrait-outline' : 'desktop-outline'}
        size={20}
        color={COLORS.textSecondary}
      />
      <View style={s.flex}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {name}
          {mine ? '  (this device)' : ''}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {os ? `${os} · ` : ''}
          {row.app} {row.app_version || '?'} · {ago(row.last_seen, serverNow)}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {lastUser}
          {userCount > 1 ? ` · ${userCount} users` : ''}
        </Text>
        {row.update_to ? (
          <Text style={s.updateTo} numberOfLines={2}>
            Update to {row.update_to}
          </Text>
        ) : null}
        {open ? (
          <View style={s.details}>
            {users.map((u) => (
              <View key={u.user} style={s.detailRow}>
                <Text style={s.userName} numberOfLines={1}>
                  {u.full_name || u.user}
                </Text>
                <Text style={s.userVersion} numberOfLines={1}>
                  {u.app_version || '?'} · {ago(u.last_seen, serverNow)}
                </Text>
              </View>
            ))}
            {users.length ? <View style={s.gap} /> : null}
            <Detail label="Model" value={model} />
            <Detail label="OS" value={os || '—'} />
            {row.previous_app_version ? (
              <Detail
                label="Upgraded"
                value={`${row.previous_app_version} → ${row.app_version} · ${ago(row.version_changed_at, serverNow)}`}
              />
            ) : null}
            <Detail label="Sign-ins" value={String(row.logins)} />
            <Detail label="Launches" value={String(row.launches)} />
            <Detail label="First seen" value={(row.first_seen ?? '—').slice(0, 16)} />
            <Detail label="IP" value={row.ip_address || '—'} />
            <Detail label="Install ID" value={row.install_id.slice(0, 8)} />
          </View>
        ) : null}
      </View>
      <StatusBadge status={row.status} />
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap: { height: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, padding: 0 },
  chip: {
    paddingHorizontal: spacing.md,
    height: 40,
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },
  chipTextOn: { color: COLORS.textOnPrimary },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  rowMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  updateTo: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.text, marginTop: 2 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  badgeText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },
  details: { marginTop: spacing.sm, gap: 2 },
  detailRow: { flexDirection: 'row', gap: spacing.sm },
  detailLabel: { width: 80, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  detailValue: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary },
  userName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.text },
  userVersion: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  errorText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.danger, marginBottom: spacing.sm },
  more: { marginTop: spacing.sm },
});
