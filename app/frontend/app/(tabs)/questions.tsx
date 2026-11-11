import React, { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput, RefreshControl } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MagnifyingGlass } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { ChipRow } from "@/src/components/ChipRow";
import { QUESTION_CATEGORIES } from "@/src/constants";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

const CATEGORY_FILTER = ["All", ...QUESTION_CATEGORIES] as const;

export default function QuestionsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [category, setCategory] = useState<(typeof CATEGORY_FILTER)[number]>("All");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["questions", category, q],
    queryFn: () => apiFetch<any[]>(`/questions?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}`),
  });

  useFocusEffect(useCallback(() => { qc.invalidateQueries({ queryKey: ["questions"] }); }, [qc]));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Question bank</Text>
        <View style={styles.search}>
          <MagnifyingGlass color={colors.muted} size={18} />
          <TextInput
            placeholder="Search questions or answers"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
            testID="questions-search"
          />
        </View>
      </View>
      <ChipRow options={CATEGORY_FILTER} value={category} onChange={setCategory} testID="questions-category" />
      {isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="No questions yet" subtitle="Questions you log inside interview rounds appear here." testID="questions-empty" />
      ) : (
        <FlatList
          data={data!}
          keyExtractor={(i) => i.question_id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => {
            const isOpen = !!expanded[item.question_id];
            return (
              <Pressable
                style={styles.card}
                onPress={() => setExpanded((e) => ({ ...e, [item.question_id]: !isOpen }))}
                testID={`question-${item.question_id}`}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.category}>{item.category}</Text>
                  <StatusBadge status={item.difficulty || "Medium"} kind="difficulty" />
                </View>
                <Text style={styles.question}>{item.question}</Text>
                {isOpen && item.answer ? <Text style={styles.answer}>{item.answer}</Text> : null}
                {item.answer ? <Text style={styles.expand}>{isOpen ? "Hide answer" : "View answer"}</Text> : null}
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}
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
    backgroundColor: c.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: c.border, gap: spacing.sm,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  category: { fontSize: fontSize.sm, color: c.brandPrimary, fontWeight: "700" },
  question: { fontSize: fontSize.base, color: c.onSurface, fontWeight: "600", lineHeight: 20 },
  answer: { fontSize: fontSize.base, color: c.onSurfaceSecondary, lineHeight: 20 },
  expand: { fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
}));
