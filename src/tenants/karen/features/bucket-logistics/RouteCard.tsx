import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import type { Route, TripStatus } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

const TRIP_BADGE: Record<TripStatus, { label: string; fg: string }> = {
  Draft: { label: 'Trip planned', fg: '#525252' },
  Requested: { label: 'Truck requested', fg: '#B45309' },
  Scheduled: { label: 'Trip started', fg: '#2563EB' },
  Dispatched: { label: 'On the road', fg: '#2563EB' },
  Received: { label: 'Completed', fg: '#166534' },
};

export function RouteCard({ route }: { route: Route }) {
  return (
    <View style={s.card}>
      <View style={s.hd}>
        <Text style={s.vehicle} numberOfLines={1}>{route.vehicle}</Text>
        {route.hasRoute ? <Text style={s.km}>{route.totalKm.toFixed(1)} km</Text> : null}
      </View>

      {route.hasRoute ? (
        route.runs.map((farms, r) => {
          const stops = [route.hub, ...farms, route.hub];
          return (
            <View key={r} style={s.chain}>
              <Text style={s.runLbl}>Trip {r + 1}</Text>
              {stops.map((stop, i) => (
                <View key={`${stop}-${i}`} style={s.chainItem}>
                  {i > 0 ? <Ionicons name="arrow-forward" size={12} color={COLORS.textMuted} style={s.arrow} /> : null}
                  <Text style={s.chainStop} numberOfLines={1}>{stop}</Text>
                </View>
              ))}
            </View>
          );
        })
      ) : (
        <View style={s.noRoute}>
          <Ionicons name="warning-outline" size={14} color="#D97706" />
          <Text style={s.noRouteTxt}>No route set for today</Text>
        </View>
      )}

      <View style={s.tripRow}>
        {route.trip ? (
          <Text style={[s.tripTxt, { color: TRIP_BADGE[route.trip.status].fg }]}>
            {TRIP_BADGE[route.trip.status].label} · {route.trip.name}
          </Text>
        ) : (
          <Text style={s.tripTxtMuted}>No trip built yet</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  hd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vehicle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text, flexShrink: 1 },
  km: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  chain: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: spacing.sm },
  chainItem: { flexDirection: 'row', alignItems: 'center' },
  runLbl: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary, marginRight: spacing.sm },
  arrow: { marginHorizontal: 4 },
  chainStop: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  noRoute: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  noRouteTxt: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#D97706' },
  tripRow: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  tripTxt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  tripTxtMuted: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
});
