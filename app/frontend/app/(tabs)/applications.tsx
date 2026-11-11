import React, { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MagnifyingGlass, Plus, Buildings } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { ChipRow } from "@/src/components/ChipRow";
import { APPLICATION_STATUSES } from "@/src/constants";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

const FILTER_OPTIONS = ["All", ...APPLICATION_STATUSES] as const;

export default function ApplicationsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]>("All");
  const [q, setQ] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["apps", filter, q],
    queryFn: () => apiFetch<any[]>(`/applications?status=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`),
  });

  useFocusEffect(useCallback(() => { qc.invalidateQueries({ queryKey: ["apps"] }); }, [qc]));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Applications</Text>
        <View style={styles.search}>
          <MagnifyingGlass color={colors.muted} size={18} />
          <TextInput
            placeholder="Search company or role"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
            testID="applications-search"
          />
        </View>
      </View>
      <ChipRow options={FILTER_OPTIONS} value={filter} onChange={setFilter} testID="applications-filter" />

      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No applications yet"
          subtitle="Log your first application to start tracking offers, rejections and interview rounds."
          actionLabel="Add application"
          onAction={() => router.push("/application/new")}
          testID="apps-empty"
        />
      ) : (
        <FlatList
          data={data!}
          keyExtractor={(i) => i.application_id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/application/${item.application_id}` as any)}
              testID={`app-card-${item.application_id}`}
            >
              <View style={styles.cardLogo}><Buildings color={colors.brandPrimary} size={22} weight="fill" /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.company}>{item.company_name}</Text>
                <Text style={styles.role}>{item.job_role}</Text>
                <Text style={styles.meta}>{item.applied_date}  ·  {item.job_location || "—"}</Text>
              </View>
              <StatusBadge status={item.application_status} kind="application" />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}

      <Pressable
        onPress={() => router.push("/application/new")}
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        testID="apps-fab"
      >
        <Plus color={colors.onBrandPrimary} size={24} weight="bold" />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  search: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: c.border,
  },
  searchInput: { flex: 1, color: c.onSurface, fontSize: fontSize.base },
  card: {
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    backgroundColor: c.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: c.border,
  },
  cardLogo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  company: { fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface },
  role: { fontSize: fontSize.base, color: c.onSurfaceSecondary },
  meta: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
  fab: {
    position: "absolute", right: spacing.xl, width: 56, height: 56, borderRadius: 28,
    backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
}));
