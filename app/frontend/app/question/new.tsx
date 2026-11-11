import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { goBack } from "@/src/nav";
import { Field } from "@/src/components/Field";
import { ChipRow } from "@/src/components/ChipRow";
import { DIFFICULTY_LEVELS, QUESTION_CATEGORIES } from "@/src/constants";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

export default function QuestionForm() {
  const { round_id } = useLocalSearchParams<{ round_id?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [form, setForm] = useState<any>({
    round_id: round_id || null,
    question: "",
    answer: "",
    category: "Other",
    difficulty: "Medium",
    notes: "",
  });

  const save = useMutation({
    mutationFn: () => apiFetch("/questions", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      qc.invalidateQueries({ queryKey: ["questions-for", round_id] });
      goBack(router, round_id ? `/round/${round_id}` : "/(tabs)/questions");
    },
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router, round_id ? `/round/${round_id}` : "/(tabs)/questions")} style={styles.back} testID="question-back"><ArrowLeft color={colors.onSurface} size={22} /></Pressable>
        <Text style={styles.title}>New question</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md }}>
          <Field label="Question *" value={form.question} onChangeText={(v: string) => set("question", v)} multiline testID="field-question" />
          <Field label="Answer / explanation" value={form.answer} onChangeText={(v: string) => set("answer", v)} multiline />
          <Text style={styles.label}>Category</Text>
          <ChipRow options={QUESTION_CATEGORIES} value={form.category} onChange={(v) => set("category", v)} />
          <Text style={styles.label}>Difficulty</Text>
          <ChipRow options={DIFFICULTY_LEVELS} value={form.difficulty} onChange={(v) => set("difficulty", v)} />
          <Field label="Additional notes" value={form.notes} onChangeText={(v: string) => set("notes", v)} multiline />
          <Pressable onPress={() => save.mutate()} disabled={!form.question || save.isPending} style={[styles.saveBtn, !form.question && { opacity: 0.5 }]} testID="save-question">
            {save.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.lg }}>Save question</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: c.onSurface },
  label: { fontSize: fontSize.sm, color: c.muted, fontWeight: "700", marginTop: spacing.sm },
  saveBtn: { marginTop: spacing.lg, backgroundColor: c.brandPrimary, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center" },
}));
