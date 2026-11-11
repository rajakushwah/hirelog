import React, { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoCamera } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { ChipRow } from "@/src/components/ChipRow";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

const FILTERS = ["All", "Upcoming", "Completed", "Cancelled"] as const;

export default function InterviewsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Upcoming");

  const { data, isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["rounds", filter],
    queryFn: () => {
      if (filter === "All") return apiFetch<any[]>("/rounds");
      if (filter === "Upcoming") return apiFetch<any[]>("/rounds?upcoming=true");
      return apiFetch<any[]>(`/rounds?status=${encodeURIComponent(filter)}`);
    },
  });

  useFocusEffect(useCallback(() => { qc.invalidateQueries({ queryKey: ["rounds"] }); }, [qc]));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Interviews</Text>
      </View>
      <ChipRow options={FILTERS} value={filter} onChange={setFilter} testID="interviews-filter" />
      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="No interviews" subtitle="Scheduled rounds will appear here." testID="rounds-empty" />
      ) : (
        <FlatList
          data={data!}
          keyExtractor={(i) => i.round_id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/round/${item.round_id}` as any)}
              testID={`round-card-${item.round_id}`}
            >
              <View style={styles.iconBox}><VideoCamera color={colors.brandPrimary} size={22} weight="fill" /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.company}>{item.company_name}</Text>
                <Text style={styles.role}>R{item.round_number} · {item.round_name}</Text>
                <Text style={styles.meta}>{item.interview_date || "—"}  {item.interview_time ? `· ${item.interview_time}` : ""}</Text>
              </View>
              <StatusBadge status={item.interview_status} kind="interview" />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  card: {
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    backgroundColor: c.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: c.border,
  },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  company: { fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface },
  role: { fontSize: fontSize.base, color: c.onSurfaceSecondary },
  meta: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
}));
