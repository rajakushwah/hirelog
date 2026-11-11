import React, { useCallback } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PieChart, BarChart } from "react-native-gifted-charts";
import { Plus, Briefcase, CalendarCheck, Trophy, XCircle, Clock } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

type Stats = {
  total_companies: number;
  total_applications: number;
  total_interviews_scheduled: number;
  interviews_completed: number;
  interviews_upcoming: number;
  offers: number;
  rejections: number;
  in_progress: number;
  status_distribution: { status: string; count: number }[];
  applications_by_month: { month: string; count: number }[];
  rounds_by_company: { company: string; count: number }[];
  upcoming_rounds: any[];
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery<Stats>({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<Stats>("/dashboard/stats"),
  });

  useFocusEffect(useCallback(() => { qc.invalidateQueries({ queryKey: ["dashboard"] }); }, [qc]));

  const pieData = (data?.status_distribution ?? []).slice(0, 6).map((s, i) => ({
    value: s.count,
    color: [colors.brandPrimary, colors.brandSecondary, colors.success, colors.warning, colors.error, colors.info][i % 6],
    text: String(s.count),
  }));

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const barData = (data?.applications_by_month ?? []).map((m) => ({
    value: m.count,
    label: MONTHS[Number(m.month.slice(5)) - 1] ?? m.month,
    frontColor: colors.brandPrimary,
  }));
  const maxBar = Math.max(3, ...barData.map((b) => b.value));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
        testID="dashboard-scroll"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi, {user?.name?.split(" ")[0] ?? "there"}</Text>
            <Text style={styles.subGreet}>Here is your job-search at a glance</Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <View style={styles.grid}>
              <StatCard icon={<Briefcase color={colors.brandPrimary} size={22} weight="fill" />} label="Companies" value={data?.total_companies ?? 0} />
              <StatCard icon={<CalendarCheck color={colors.info} size={22} weight="fill" />} label="Upcoming" value={data?.interviews_upcoming ?? 0} />
              <StatCard icon={<Trophy color={colors.success} size={22} weight="fill" />} label="Offers" value={data?.offers ?? 0} />
              <StatCard icon={<XCircle color={colors.error} size={22} weight="fill" />} label="Rejections" value={data?.rejections ?? 0} />
              <StatCard icon={<Clock color={colors.warning} size={22} weight="fill" />} label="In Progress" value={data?.in_progress ?? 0} />
              <StatCard icon={<CalendarCheck color={colors.brandSecondary} size={22} weight="fill" />} label="Completed" value={data?.interviews_completed ?? 0} />
            </View>

            {pieData.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Status distribution</Text>
                <View style={{ alignItems: "center", marginTop: spacing.md }}>
                  <PieChart data={pieData} donut radius={90} innerRadius={55} innerCircleColor={colors.surfaceSecondary} />
                </View>
                <View style={styles.legend}>
                  {(data?.status_distribution ?? []).slice(0, 6).map((s, i) => (
                    <View key={s.status} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: pieData[i]?.color }]} />
                      <Text style={styles.legendText}>{s.status} · {s.count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {barData.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Applications by month</Text>
                <BarChart
                  data={barData}
                  barWidth={28}
                  height={160}
                  frontColor={colors.brandPrimary}
                  yAxisColor={colors.border}
                  xAxisColor={colors.border}
                  yAxisTextStyle={{ color: colors.muted, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: colors.muted, fontSize: 10 }}
                  noOfSections={3}
                  maxValue={Math.ceil(maxBar / 3) * 3}
                  stepValue={Math.ceil(maxBar / 3)}
                />
              </View>
            )}

            <View style={styles.quickRow}>
              <Pressable style={[styles.quickBtn, { backgroundColor: colors.brandPrimary }]} onPress={() => router.push("/application/new")} testID="quick-add-app">
                <Plus color={colors.onBrandPrimary} size={18} weight="bold" />
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>New application</Text>
              </Pressable>
              <Pressable style={[styles.quickBtn, { backgroundColor: colors.brandTertiary }]} onPress={() => router.push("/(tabs)/interviews" as any)} testID="quick-view-interviews">
                <CalendarCheck color={colors.onBrandTertiary} size={18} weight="bold" />
                <Text style={{ color: colors.onBrandTertiary, fontWeight: "700" }}>View interviews</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  const styles = useStyles();
  return (
    <View style={styles.stat} testID={`stat-${label.toLowerCase()}`}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  greeting: { fontSize: fontSize.xxl, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  subGreet: { fontSize: fontSize.base, color: c.muted, marginTop: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.xl },
  stat: {
    width: "47%",
    backgroundColor: c.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: c.border,
  },
  statIcon: { marginBottom: spacing.sm },
  statValue: { fontSize: fontSize.xxl, fontWeight: "800", color: c.onSurface },
  statLabel: { fontSize: fontSize.sm, color: c.muted, fontWeight: "600" },
  card: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: fontSize.sm, color: c.onSurface },
  quickRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
  },
}));
