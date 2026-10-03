import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Card } from '@/src/core/ui/Card';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { ItemGroupFilter } from '@/src/core/ui/ItemGroupFilter';
import {
  useKarenDashboardStore,
  type DashboardOrder,
  type DashboardPacker,
  type DashboardTeam,
} from '@/src/tenants/karen/state/karen-dashboard-store';
import { useKarenTeamsStore } from '@/src/tenants/karen/state/karen-teams-store';
import { useNetworkStore } from '@/src/core/network/store';
import { formatDayLabel, tomorrowISO } from '@/src/core/date';

/**
 * Packhouse home dashboard — deliberately styled identically to
 * upande-production's AgricultureDashboard (same hero/tile/variance-card/
 * list-row/quick-actions layout and colour language), with packing's own
 * "boxes required vs boxes packed" reconciliation standing in for
 * production's "harvested vs received". See that component for the full
 * design rationale; this one only changes what the numbers mean.
 */

const HERO_BG = '#052E16';
const HERO_ACCENT = '#0A4A22';
const DARK_REQUIRED = '#171717';
const DARK_STEMS = '#1C1917';
const DARK_ISSUE_ACTIVE = '#3B0A0A';

interface StopGroup {
  deliveryPoint: string;
  required: number;
  packed: number;
  orders: DashboardOrder[];
}

function groupByDeliveryPoint(rows: DashboardOrder[]): StopGroup[] {
  const stops = new Map<string, StopGroup>();
  for (const o of rows) {
    const key = o.deliveryPoint || 'Unassigned';
    let s = stops.get(key);
    if (!s) {
      s = { deliveryPoint: key, required: 0, packed: 0, orders: [] };
      stops.set(key, s);
    }
    s.required += o.boxesRequired;
    s.packed += o.boxesPacked;
    s.orders.push(o);
  }
  return Array.from(stops.values())
    .map((s) => ({ ...s, orders: s.orders.sort((a, b) => b.boxesRequired - a.boxesRequired) }))
    .sort((a, b) => b.required - a.required);
}

function CollapsibleSection({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={s.collapsible}>
      <Pressable style={s.collapsibleHeader} onPress={() => setOpen((v) => !v)}>
        <Text style={s.sectionLabel}>{label}</Text>
        <View style={s.collapsibleHeaderRight}>
          {count ? <Text style={s.sectionCount}>{count}</Text> : null}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
        </View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

export function PackhouseDashboard() {
  const router = useRouter();
  const data = useKarenDashboardStore((s) => s.data);
  const loading = useKarenDashboardStore((s) => s.loading);
  const error = useKarenDashboardStore((s) => s.error);
  const selectedDate = useKarenDashboardStore((s) => s.selectedDate);
  const setDate = useKarenDashboardStore((s) => s.setDate);
  const online = useNetworkStore((s) => s.online);
  const canonicalTeams = useKarenTeamsStore((s) => s.teams);
  const loadTeams = useKarenTeamsStore((s) => s.load);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  // An order spanning several teams carries them as "Team A, Team B" (see
  // getPackhouseDashboardData) -- split rather than compare for equality so
  // such an order still matches EITHER team it touches.
  const orderTeams = (team: string) => team.split(',').map((t) => t.trim()).filter(Boolean);

  // Canonical team list (Packing Teams doctype), with how many of today's
  // orders each one covers -- filters the ORDERS section below by team; the
  // KPI tiles above stay global (they already have their own per-team
  // breakdown in the Team Performance section further down).
  const teamOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of data?.orders ?? []) {
      for (const t of orderTeams(o.team)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return canonicalTeams.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [canonicalTeams, data]);

  const filteredOrders = useMemo(() => {
    const orders = data?.orders ?? [];
    return selectedTeam ? orders.filter((o) => orderTeams(o.team).includes(selectedTeam)) : orders;
  }, [data, selectedTeam]);

  const stopGroups = useMemo(() => groupByDeliveryPoint(filteredOrders), [filteredOrders]);
  const showLoading = loading && !data;

  if (showLoading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={COLORS.text} />
      </View>
    );
  }

  const kpi = data?.kpi;
  const issues = (kpi?.bypassIssues ?? 0) + (kpi?.underpackIssues ?? 0);
  const hasIssues = issues > 0;
  const difference = (kpi?.boxesPacked ?? 0) - (kpi?.boxesRequired ?? 0);
  const differencePct = kpi?.boxesRequired ? Math.round((difference / kpi.boxesRequired) * 100) : 0;
  const isEmpty = !loading && data && (kpi?.ordersTotal ?? 0) === 0;
  const stopCount = stopGroups.length;

  return (
    <View>
      <View style={s.topRow}>
        <Text style={s.dateText}>Packhouse overview</Text>
        <View style={[s.statusPill, online ? s.pillLive : s.pillOffline]}>
          <View style={[s.statusDot, online ? s.dotLive : s.dotOffline]} />
          <Text style={[s.statusText, online ? s.statusTextLive : s.statusTextOffline]}>
            {online ? 'Live' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Delivery date -- this was previously hardcoded to today with no way
          to view any other day's stats. */}
      <Card>
        <DateSelector
          value={selectedDate}
          onChange={setDate}
          label="Delivery date"
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
      </Card>

      {error ? (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#991B1B" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Hero — boxes packed so far for this delivery date */}
      <Pressable style={s.hero} onPress={() => router.push('/packing' as never)}>
        <View style={s.heroBubble} />
        <Text style={s.heroChip}>BOXES PACKED</Text>
        <Text style={s.heroNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
          {(kpi?.boxesPacked ?? 0).toLocaleString()}
        </Text>
        <Text style={s.heroUnit}>
          of {(kpi?.boxesRequired ?? 0).toLocaleString()} boxes · {kpi?.ordersDone ?? 0}/{kpi?.ordersTotal ?? 0} orders ready
        </Text>
        <Ionicons name="cube" size={72} color="rgba(255,255,255,0.06)" style={s.heroIcon} />
      </Pressable>

      {/* Required + stems packed — dark volume tiles */}
      <View style={s.row}>
        <View style={[s.tile, { backgroundColor: DARK_REQUIRED }]}>
          <Text style={s.tileChip}>REQUIRED</Text>
          <Text style={s.tileNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {(kpi?.boxesRequired ?? 0).toLocaleString()}
          </Text>
          <Text style={s.tileUnit}>boxes</Text>
        </View>
        <View style={[s.tile, { backgroundColor: DARK_STEMS }]}>
          <Text style={s.tileChip}>STEMS PACKED</Text>
          <Text style={s.tileNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {(kpi?.stemsPacked ?? 0).toLocaleString()}
          </Text>
          <Text style={s.tileUnit}>stems</Text>
        </View>
      </View>

      {/* Expected stems + orders fulfilled — what this delivery date is ON
          THE HOOK for, alongside what's actually been packed above */}
      <View style={s.row}>
        <View style={[s.tile, { backgroundColor: DARK_REQUIRED }]}>
          <Text style={s.tileChip}>STEMS EXPECTED</Text>
          <Text style={s.tileNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {(kpi?.stemsExpected ?? 0).toLocaleString()}
          </Text>
          <Text style={s.tileUnit}>stems</Text>
        </View>
        <View style={[s.tile, { backgroundColor: DARK_STEMS }]}>
          <Text style={s.tileChip}>ORDERS FULFILLED</Text>
          <Text style={s.tileNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {(kpi?.ordersDone ?? 0).toLocaleString()}
          </Text>
          <Text style={s.tileUnit}>of {(kpi?.ordersTotal ?? 0).toLocaleString()} orders</Text>
        </View>
      </View>

      {/* Packing issues — dark, turns dark red only when there's something in it */}
      <View style={[s.issueTile, hasIssues && s.issueTileActive]}>
        <View style={s.issueTileLeft}>
          <Text style={[s.tileChip, hasIssues && { color: '#FECACA' }]}>PACKING ISSUES</Text>
          <Text
            style={[s.issueNumber, hasIssues ? { color: '#FCA5A5' } : { color: COLORS.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {issues.toLocaleString()}
          </Text>
          <Text style={[s.tileUnit, hasIssues && { color: '#FCA5A5' }]}>logged today</Text>
        </View>
        {hasIssues ? (
          <View style={s.issueBreakdown}>
            <View style={s.issueBreakdownRow}>
              <Text style={s.issueBreakdownLabel}>Bypass</Text>
              <Text style={s.issueBreakdownValue}>{(kpi?.bypassIssues ?? 0).toLocaleString()}</Text>
            </View>
            <View style={s.issueBreakdownRow}>
              <Text style={s.issueBreakdownLabel}>Under-pack</Text>
              <Text style={s.issueBreakdownValue}>{(kpi?.underpackIssues ?? 0).toLocaleString()}</Text>
            </View>
            <View style={s.issueBreakdownRow}>
              <Text style={s.issueBreakdownLabel}>Under-pack %</Text>
              <Text style={s.issueBreakdownValue}>{(kpi?.underpackPercentage ?? 0).toLocaleString()}%</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Pending orders — slim banner, only when there's something waiting */}
      {(kpi?.ordersPending ?? 0) > 0 ? (
        <View style={s.pendingBanner}>
          <Ionicons name="time-outline" size={15} color="#92400E" />
          <Text style={s.pendingText}>
            <Text style={s.pendingNum}>{(kpi!.ordersPending).toLocaleString()}</Text> order
            {kpi!.ordersPending === 1 ? '' : 's'} still pending for this delivery date
          </Text>
        </View>
      ) : null}

      {/* Reconciliation card — required vs packed */}
      <View style={s.varianceCard}>
        <Text style={s.varianceLabel}>REQUIRED VS PACKED</Text>
        <View style={s.varianceBody}>
          <View style={s.varianceStat}>
            <Text style={s.varianceStatLabel}>Required</Text>
            <Text style={s.varianceStatNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {(kpi?.boxesRequired ?? 0).toLocaleString()}
            </Text>
            <Text style={s.varianceStatUnit}>boxes</Text>
          </View>
          <View style={s.varianceDivider} />
          <View style={s.varianceStat}>
            <Text style={s.varianceStatLabel}>Packed</Text>
            <Text style={s.varianceStatNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {(kpi?.boxesPacked ?? 0).toLocaleString()}
            </Text>
            <Text style={s.varianceStatUnit}>boxes</Text>
          </View>
          <View style={s.varianceDivider} />
          <View style={s.varianceStat}>
            <Text style={s.varianceStatLabel}>Remaining</Text>
            <Text
              style={[s.varianceStatNum, difference >= 0 ? s.deltaPos : s.deltaNeg]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {difference > 0 ? '+' : ''}
              {difference.toLocaleString()}
            </Text>
            <Text style={[s.varianceStatUnit, difference >= 0 ? s.deltaPos : s.deltaNeg]}>
              {differencePct > 0 ? '+' : ''}
              {differencePct}%
            </Text>
          </View>
        </View>
      </View>

      {/* Top varieties packed for this delivery date */}
      {(data?.topVarieties.length ?? 0) > 0 ? (
        <CollapsibleSection label="TOP VARIETIES PACKED" defaultOpen={false}>
          <View style={s.varietyRow}>
            {data!.topVarieties.slice(0, 8).map((v) => (
              <View key={v.itemCode} style={s.varietyChip}>
                <Text style={s.varietyChipStems}>{v.stems.toLocaleString()}</Text>
                <Text style={s.varietyChipName} numberOfLines={1}>{v.itemCode}</Text>
              </View>
            ))}
          </View>
        </CollapsibleSection>
      ) : null}

      {/* Team-wise performance for this delivery date */}
      {(data?.teams.length ?? 0) > 0 ? (
        <CollapsibleSection
          label="TEAM PERFORMANCE"
          count={`${data!.teams.length} ${data!.teams.length === 1 ? 'team' : 'teams'}`}
          defaultOpen={false}
        >
          {data!.teams.map((t) => (
            <TeamRow key={t.team} t={t} />
          ))}
        </CollapsibleSection>
      ) : null}

      {/* Packer performance — top and bottom packers by stems packed today */}
      {(data?.topPackers.length ?? 0) > 0 ? (
        <CollapsibleSection label="PACKER PERFORMANCE" defaultOpen={false}>
          <Text style={s.packerGroupLabel}>Top packers</Text>
          {data!.topPackers.map((p, i) => (
            <PackerRow key={p.user} p={p} rank={i + 1} good />
          ))}
          {data!.bottomPackers.length > 0 ? (
            <>
              <Text style={[s.packerGroupLabel, { marginTop: spacing.sm }]}>Bottom packers</Text>
              {data!.bottomPackers.map((p, i) => (
                <PackerRow key={p.user} p={p} rank={i + 1} good={false} />
              ))}
            </>
          ) : null}
        </CollapsibleSection>
      ) : null}

      {/* Delivery point → order breakdown, filterable by team. The filter
          row is shown whenever there's a team to filter by, even if the
          CURRENT selection matches nothing -- otherwise a team with no
          orders today would also hide the only control that can clear the
          filter back to "All". */}
      {stopGroups.length > 0 || teamOptions.length > 0 ? (
        <CollapsibleSection label="ORDERS" count={`${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}`} defaultOpen>
          {teamOptions.length > 0 ? (
            <ItemGroupFilter
              label="Team"
              groups={teamOptions}
              totalCount={data?.orders.length ?? 0}
              selected={selectedTeam}
              onSelect={setSelectedTeam}
            />
          ) : null}
          {stopGroups.length > 0 ? (
            stopGroups.map((stop) => (
              <View key={stop.deliveryPoint}>
                {stopGroups.length > 1 ? <Text style={s.stopLabel}>{stop.deliveryPoint}</Text> : null}
                {stop.orders.map((o) => (
                  <OrderRow key={o.salesOrder} o={o} />
                ))}
              </View>
            ))
          ) : (
            <Text style={s.helperEmpty}>No orders for {selectedTeam} on this delivery date.</Text>
          )}
        </CollapsibleSection>
      ) : isEmpty ? (
        <View style={s.emptyCard}>
          <Ionicons name="cube-outline" size={28} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>No orders due {data ? formatDayLabel(data.deliveryDate) : 'yet'}</Text>
          <Text style={s.emptyBody}>Orders for this delivery date will show up here once planned.</Text>
          <Pressable style={s.emptyCta} onPress={() => router.push('/packing' as never)}>
            <Ionicons name="add" size={16} color={COLORS.textOnPrimary} />
            <Text style={s.emptyCtaText}>Go to Packing</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Quick actions */}
      <View style={s.actionsWrap}>
        <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
        <View style={s.actionsRow}>
          <ActionChip icon="cube-outline" label="Packing" onPress={() => router.push('/packing' as never)} />
          <ActionChip icon="send-outline" label="Issuing" onPress={() => router.push('/issuing' as never)} />
          <ActionChip icon="list-outline" label="Scheduler" onPress={() => router.push('/scheduler' as never)} />
          <ActionChip icon="car-outline" label="Loading" onPress={() => router.push('/loading' as never)} />
          <ActionChip icon="paper-plane-outline" label="Dispatch" onPress={() => router.push('/dispatch' as never)} />
        </View>
      </View>
    </View>
  );
}

function OrderRow({ o }: { o: DashboardOrder }) {
  const ratio = o.boxesRequired > 0 ? Math.min(1, o.boxesPacked / o.boxesRequired) : 0;
  const ratioPct = Math.round(ratio * 100);
  const complete = o.boxesRequired > 0 && o.boxesPacked >= o.boxesRequired;

  return (
    <View style={s.orderRowCard}>
      <View style={s.orderRowMain}>
        <View style={s.orderRowLeft}>
          <Text style={s.orderRowName} numberOfLines={1}>{o.customer || o.orderName}</Text>
          <Text style={s.orderRowMeta} numberOfLines={1}>
            {[o.orderName, o.farm].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={s.orderRowRight}>
          <View style={s.orderRowPair}>
            <Text style={s.orderRowNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {o.boxesRequired.toLocaleString()}
            </Text>
            <Text style={s.orderRowArrow}>→</Text>
            <Text
              style={[s.orderRowNum, o.boxesPacked === 0 && s.orderRowNumMuted, complete && s.orderRowNumGood]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {o.boxesPacked.toLocaleString()}
            </Text>
          </View>
          <Text style={s.orderRowRatio}>{o.boxesRequired > 0 ? `${ratioPct}% packed` : '—'}</Text>
        </View>
      </View>
      <View style={s.orderRowBarTrack}>
        <View style={[s.orderRowBarFill, complete && s.orderRowBarFillFull, { width: `${ratioPct}%` }]} />
      </View>
    </View>
  );
}

function TeamRow({ t }: { t: DashboardTeam }) {
  const boxRatio = t.boxesRequired > 0 ? Math.min(1, t.boxesPacked / t.boxesRequired) : 0;
  const complete = t.boxesRequired > 0 && t.boxesPacked >= t.boxesRequired;

  return (
    <View style={s.orderRowCard}>
      <View style={s.orderRowMain}>
        <View style={s.orderRowLeft}>
          <Text style={s.orderRowName} numberOfLines={1}>{t.team}</Text>
          <Text style={s.orderRowMeta} numberOfLines={1}>
            {t.ordersDone}/{t.ordersTotal} orders ready · {t.stemsPacked.toLocaleString()} of{' '}
            {t.stemsExpected.toLocaleString()} stems
          </Text>
        </View>
        <View style={s.orderRowRight}>
          <View style={s.orderRowPair}>
            <Text style={s.orderRowNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t.boxesRequired.toLocaleString()}
            </Text>
            <Text style={s.orderRowArrow}>→</Text>
            <Text
              style={[s.orderRowNum, t.boxesPacked === 0 && s.orderRowNumMuted, complete && s.orderRowNumGood]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t.boxesPacked.toLocaleString()}
            </Text>
          </View>
          <Text style={s.orderRowRatio}>boxes</Text>
        </View>
      </View>
      <View style={s.orderRowBarTrack}>
        <View style={[s.orderRowBarFill, complete && s.orderRowBarFillFull, { width: `${Math.round(boxRatio * 100)}%` }]} />
      </View>
    </View>
  );
}

function PackerRow({ p, rank, good }: { p: DashboardPacker; rank: number; good: boolean }) {
  return (
    <View style={s.packerRow}>
      <View style={[s.packerRank, good ? s.packerRankGood : s.packerRankBad]}>
        <Text style={[s.packerRankText, good ? s.packerRankTextGood : s.packerRankTextBad]}>{rank}</Text>
      </View>
      <View style={s.packerInfo}>
        <Text style={s.orderRowName} numberOfLines={1}>{p.name}</Text>
        <Text style={s.orderRowMeta} numberOfLines={1}>{p.bunches.toLocaleString()} bunches packed</Text>
      </View>
      <Text style={s.packerStems} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {p.stems.toLocaleString()}
      </Text>
    </View>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.actionChip, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={COLORS.text} />
      <Text style={s.actionChipLabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  loadingWrap: { paddingVertical: spacing.xxl, alignItems: 'center' },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dateText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.full, borderWidth: 1,
  },
  pillLive: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  pillOffline: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotLive: { backgroundColor: '#16A34A' },
  dotOffline: { backgroundColor: '#D97706' },
  statusText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },
  statusTextLive: { color: '#16A34A' },
  statusTextOffline: { color: '#D97706' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FEF2F2', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  errorText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#991B1B' },

  hero: {
    backgroundColor: HERO_BG,
    borderRadius: 24,
    padding: spacing.xl,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    minHeight: 160,
  },
  heroBubble: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: HERO_ACCENT, bottom: -60, right: -40,
  },
  heroChip: {
    fontFamily: fontFamily.medium, fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: spacing.sm,
  },
  heroNumber: { fontFamily: fontFamily.bold, fontSize: 52, color: '#FFFFFF', lineHeight: 56 },
  heroUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  heroIcon: { position: 'absolute', bottom: spacing.lg, right: spacing.xl },

  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1, borderRadius: 20, padding: spacing.lg,
    minHeight: 110, justifyContent: 'flex-end',
  },
  tileChip: {
    fontFamily: fontFamily.medium, fontSize: 10,
    color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: spacing.xs,
  },
  tileNumber: { fontFamily: fontFamily.bold, fontSize: 34, color: '#FFFFFF', lineHeight: 38 },
  tileUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  issueTile: {
    backgroundColor: DARK_STEMS, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg,
  },
  issueTileActive: { backgroundColor: DARK_ISSUE_ACTIVE },
  issueTileLeft: { flex: 1 },
  issueNumber: { fontFamily: fontFamily.bold, fontSize: 36, lineHeight: 40 },
  issueBreakdown: { justifyContent: 'center', gap: spacing.xs, paddingTop: 6 },
  issueBreakdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    justifyContent: 'space-between', minWidth: 110,
  },
  issueBreakdownLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.45)' },
  issueBreakdownValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#FCA5A5' },

  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  pendingText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#92400E' },
  pendingNum: { fontFamily: fontFamily.bold },

  varianceCard: {
    backgroundColor: '#FFFBEB', borderRadius: 20, padding: spacing.lg,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: '#FDE68A',
  },
  varianceLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: '#92400E', letterSpacing: 1.2 },
  varianceBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: spacing.md },
  varianceStat: { alignItems: 'center', flex: 1 },
  varianceDivider: { width: 1, height: 40, backgroundColor: '#FDE68A' },
  varianceStatLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: '#92400E', marginBottom: 4 },
  varianceStatNum: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  varianceStatUnit: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  deltaPos: { color: '#16A34A' },
  deltaNeg: { color: '#DC2626' },

  collapsible: { marginTop: spacing.md, marginBottom: spacing.sm },
  collapsibleHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xs, paddingHorizontal: 2, marginBottom: spacing.sm,
  },
  collapsibleHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  varietyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  varietyChip: {
    backgroundColor: COLORS.surface, borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 92,
  },
  varietyChipStems: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  varietyChipName: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted, marginTop: 1, maxWidth: 100 },

  sectionLabel: { fontFamily: fontFamily.semiBold, fontSize: 10, color: COLORS.textMuted, letterSpacing: 1.4 },
  sectionCount: { fontFamily: fontFamily.medium, fontSize: 10, color: COLORS.textMuted },
  stopLabel: {
    fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary,
    marginTop: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: 2,
  },
  helperEmpty: {
    fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted,
    paddingHorizontal: 2, paddingVertical: spacing.sm,
  },

  orderRowCard: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, paddingBottom: spacing.sm,
    marginBottom: spacing.xs + 2, overflow: 'hidden',
  },
  orderRowMain: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.sm },
  orderRowLeft: { flex: 1, paddingRight: spacing.sm },
  orderRowName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  orderRowMeta: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  orderRowRight: { alignItems: 'flex-end' },
  orderRowPair: { flexDirection: 'row', alignItems: 'baseline' },
  orderRowNum: { fontFamily: fontFamily.bold, fontSize: 17, color: COLORS.text, minWidth: 24, textAlign: 'right' },
  orderRowNumMuted: { color: COLORS.textMuted, fontFamily: fontFamily.regular },
  orderRowNumGood: { color: '#15803D' },
  orderRowArrow: { fontFamily: fontFamily.regular, fontSize: 12, color: COLORS.textMuted, marginHorizontal: 6 },
  orderRowRatio: {
    fontFamily: fontFamily.medium, fontSize: 9, color: COLORS.textMuted,
    letterSpacing: 0.6, marginTop: 1, textTransform: 'uppercase',
  },
  orderRowBarTrack: { height: 3, backgroundColor: COLORS.bgMuted, marginHorizontal: -spacing.md },
  orderRowBarFill: { height: '100%', backgroundColor: '#22C55E' },
  orderRowBarFillFull: { backgroundColor: '#15803D' },

  packerGroupLabel: {
    fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary,
    marginBottom: spacing.xs, paddingHorizontal: 2,
  },
  packerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.xs + 2,
  },
  packerRank: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  packerRankGood: { backgroundColor: '#DCFCE7' },
  packerRankBad: { backgroundColor: '#FEE2E2' },
  packerRankText: { fontFamily: fontFamily.bold, fontSize: fontSize.xs },
  packerRankTextGood: { color: '#15803D' },
  packerRankTextBad: { color: '#B91C1C' },
  packerInfo: { flex: 1, paddingRight: spacing.sm },
  packerStems: { fontFamily: fontFamily.bold, fontSize: 17, color: COLORS.text, minWidth: 40, textAlign: 'right' },

  emptyCard: {
    alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
    padding: spacing.xl, marginBottom: spacing.sm, gap: spacing.xs,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text, marginTop: spacing.xs },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  emptyCtaText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textOnPrimary },

  actionsWrap: { marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: 4 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  actionChipLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
});
