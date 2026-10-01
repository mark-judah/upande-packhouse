import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen } from "@/src/core/ui/Screen";
import { Card, Alert } from "@/src/core/ui/Card";
import { DateSelector } from "@/src/core/ui/DateSelector";
import { Segmented } from "@/src/core/ui/Segmented";
import { Skeleton } from "@/src/core/ui/Skeleton";
import { tomorrowISO } from "@/src/core/date";
import { ScanField, type ScanFieldHandle } from "@/src/core/scanning/ScanField";
import { focusWhenReady } from "@/src/core/scanning/focus";
import { useToast } from "@/src/core/ui/Toast";
import { useKarenPrecoolingStore } from "@/src/tenants/karen/state/karen-precooling-store";
import type {
  PrecoolingCounts,
  PrecoolingOrder,
} from "@/src/tenants/karen/api/karen-precooling-api";
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from "@/src/core/theme";

const COUNTS: readonly { key: keyof PrecoolingCounts; label: string }[] = [
  { key: "packed", label: "Packed" },
  { key: "awaiting", label: "Not in" },
  { key: "in_precooling", label: "In room" },
  { key: "staged", label: "Staged" },
];

type GroupBy = "order" | "customer" | "delivery_point";

const GROUP_OPTIONS: readonly { value: GroupBy; label: string }[] = [
  { value: "order", label: "Order" },
  { value: "customer", label: "Customer" },
  { value: "delivery_point", label: "Delivery point" },
];

type CountGroup = PrecoolingCounts & {
  key: string;
  title: string;
  /** Sales orders folded into this group. */
  orders: string[];
};

/** Sum the per-order counts into one group per customer or delivery point. */
function groupOrders(orders: PrecoolingOrder[], by: GroupBy): CountGroup[] {
  const map = new Map<string, CountGroup>();
  for (const o of orders) {
    const title =
      by === "order"
        ? o.customer || o.sales_order
        : by === "customer"
          ? o.customer || "No customer"
          : o.delivery_point || "No delivery point";
    const key = by === "order" ? o.sales_order : title;
    const g = map.get(key) ?? {
      key,
      title,
      orders: [],
      packed: 0,
      awaiting: 0,
      in_precooling: 0,
      precooled: 0,
      staged: 0,
    };
    g.orders.push(o.sales_order);
    for (const c of COUNTS) g[c.key] += o[c.key];
    g.precooled += o.precooled;
    map.set(key, g);
  }
  const list = [...map.values()];
  return by === "order" ? list : list.sort((a, b) => a.title.localeCompare(b.title));
}

/** Placeholder for CountTiles while the summary loads — same tile boxes. */
function TilesSkeleton() {
  return (
    <View style={s.tiles}>
      {COUNTS.map((c) => (
        <View key={c.key} style={[s.tile, s.tileSkeleton]}>
          <Skeleton width={28} height={18} />
          <Skeleton width="70%" height={10} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder for the per-group cards below. */
function GroupsSkeleton() {
  return (
    <>
      <Skeleton width={70} height={10} style={{ marginBottom: spacing.sm }} />
      <Skeleton height={36} radius={borderRadius.full} style={{ marginBottom: spacing.md }} />
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="30%" height={10} style={{ marginTop: spacing.sm }} />
          <TilesSkeleton />
        </Card>
      ))}
    </>
  );
}

/** One tile per stage: Packed, Not in, In room, Staged. */
function CountTiles({
  counts,
  strong,
}: {
  counts: PrecoolingCounts;
  strong?: boolean;
}) {
  return (
    <View style={s.tiles}>
      {COUNTS.map((c) => (
        <View
          key={c.key}
          style={[s.tile, c.key === "in_precooling" && s.tileAccent]}
        >
          <Text
            style={[
              s.countValue,
              strong && s.countValueStrong,
              c.key === "in_precooling" && s.countAccent,
            ]}
          >
            {counts[c.key]}
          </Text>
          <Text style={s.countLabel} numberOfLines={1}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function KarenPrecoolingScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("order");
  const { showSuccess, showError, showInfo } = useToast();
  const {
    submitting,
    lastOutcome,
    submitScan,
    reset,
    deliveryDate,
    setDeliveryDate,
    summary,
    summaryLoading,
    summaryError,
    loadSummary,
  } = useKarenPrecoolingStore();

  const groups = useMemo(
    () => groupOrders(summary?.orders ?? [], groupBy),
    [summary, groupBy],
  );

  useEffect(() => {
    void loadSummary();
    return () => reset();
  }, [loadSummary, reset]);

  useFocusEffect(
    useCallback(() => {
      if (submitting) return;
      focusWhenReady(scanRef);
    }, [submitting]),
  );

  const onScan = async (raw: string) => {
    const outcome = await submitScan(raw);
    if (outcome.kind === "success") showSuccess(outcome.message || "Saved");
    else if (outcome.kind === "warning")
      showInfo(outcome.message || "Check the scan and try again");
    else showError(outcome.message || "Failed to record precooling");
    scanRef.current?.clear();
    focusWhenReady(scanRef);
  };

  return (
    <Screen title="Precooling" onRefresh={loadSummary}>
      {/* "Boxes" sits on the card's top edge, fieldset-legend style: a
          filled pill the border runs into. */}
      <View style={s.boxesWrap}>
        <Card style={s.boxesCard}>
          <DateSelector
            value={deliveryDate}
            onChange={(d) => {
              if (d !== deliveryDate) setDeliveryDate(d);
            }}
            label="Delivery date"
            maxDate={null}
            resetTo={tomorrowISO()}
            resetLabel="Tomorrow"
            compact
          />
          {summary ? <CountTiles counts={summary.totals} strong /> : null}
          {summaryLoading && !summary ? <TilesSkeleton /> : null}
          {summaryError ? <Alert tone="danger">{summaryError}</Alert> : null}
        </Card>
        <View style={s.legendWrap} pointerEvents="none">
          <View style={s.legend}>
            <Text style={s.boxesTitle}>Boxes</Text>
          </View>
        </View>
      </View>

      {/* One tab: a scan here puts a packed box into the precooling room.
          It leaves the room when staging scans the location and then the
          box, which marks it precooled and staged in one step. */}
      <Card title="Scan box into precooling">
        <ScanField
          ref={scanRef}
          onScan={onScan}
          autoFocus={!submitting}
          editable={!submitting}
          placeholder="Scan box label"
        />
        {submitting ? <Text style={s.helper}>Submitting…</Text> : null}
      </Card>

      {lastOutcome ? (
        lastOutcome.kind === "success" ? (
          <Card title="Last scanned">
            <View style={s.okRow}>
              <Text style={s.okText}>{lastOutcome.message}</Text>
            </View>
          </Card>
        ) : (
          <Alert tone={lastOutcome.kind === "warning" ? "warn" : "danger"}>
            {lastOutcome.message}
          </Alert>
        )
      ) : null}


      {summary && summary.orders.length > 0 ? (
        <>
          <Text style={s.groupLabel}>Group by</Text>
          <Segmented value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
        </>
      ) : null}

      {summaryLoading && !summary ? <GroupsSkeleton /> : null}

      {groups.map((g) => (
        <Card key={g.key} title={g.title}>
          <Text style={s.orderRef}>
            {groupBy === "order"
              ? g.orders[0]
              : `${g.orders.length} order${g.orders.length === 1 ? "" : "s"}`}
          </Text>
          <CountTiles counts={g} />
        </Card>
      ))}
    </Screen>
  );
}

const LEGEND_HEIGHT = 20;

const s = StyleSheet.create({
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginTop: spacing.xs,
  },
  okRow: { paddingVertical: spacing.xs },
  okText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
  },
  boxesWrap: { marginTop: spacing.sm },
  boxesCard: { paddingTop: spacing.lg, paddingBottom: spacing.md },
  legendWrap: {
    position: "absolute",
    top: -LEGEND_HEIGHT / 2,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  legend: {
    height: LEGEND_HEIGHT,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: borderRadius.full,
    backgroundColor: COLORS.primary,
  },
  boxesTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    lineHeight: LEGEND_HEIGHT,
    color: COLORS.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  tiles: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  tile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgMuted,
  },
  tileSkeleton: { gap: spacing.sm, backgroundColor: COLORS.surface },
  tileAccent: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  countValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: COLORS.text,
  },
  countValueStrong: { fontFamily: fontFamily.bold, fontSize: fontSize.lg },
  countAccent: { color: COLORS.primary },
  countLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
  },
  groupLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  orderRef: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
  },
});
