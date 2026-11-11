import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Image, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Images, Camera, FileText, VideoCamera, X } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { Field } from "@/src/components/Field";
import { ChipRow } from "@/src/components/ChipRow";
import { pickFiles, uploadAttachment, PickKind } from "@/src/attachments";
import { goBack } from "@/src/nav";
import type { LocalFile } from "@/src/utils/upload";
import { DIFFICULTY_LEVELS, INTERVIEW_PLATFORMS, INTERVIEW_RESULTS, INTERVIEW_STATUSES, INTERVIEW_TYPES } from "@/src/constants";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

type InterviewType = (typeof INTERVIEW_TYPES)[number];

export default function RoundForm() {
  const { id, application_id, round_number } = useLocalSearchParams<{ id?: string; application_id?: string; round_number?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const isEdit = !!id;

  const [form, setForm] = useState<any>({
    application_id: application_id || "",
    round_number: Number(round_number) || 1,
    round_name: "",
    interview_types: ["Technical"] as InterviewType[],
    interview_date: new Date().toISOString().slice(0, 10),
    interview_time: "",
    duration: "",
    interviewer_name: "",
    interviewer_designation: "",
    interviewer_email: "",
    interview_platform: "Google Meet",
    meeting_link: "",
    interview_status: "Scheduled",
    interview_result: "Pending",
    feedback: "",
    difficulty: "Medium",
    notes: "",
  });
  const [pending, setPending] = useState<LocalFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: existing } = useQuery<any>({
    queryKey: ["round-edit", id],
    queryFn: () => apiFetch<any>(`/rounds/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      const types = existing.interview_types?.length
        ? existing.interview_types
        : String(existing.interview_type || "").split("+").map((t: string) => t.trim()).filter(Boolean);
      setForm((f: any) => ({ ...f, ...existing, interview_types: types }));
    }
  }, [existing]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const addFiles = async (kind: PickKind) => {
    setError(null);
    try {
      const r = await pickFiles(kind);
      if (r.error) setError(r.error);
      if (r.files.length) setPending((p) => [...p, ...r.files]);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify(form);
      const saved: any = isEdit
        ? await apiFetch(`/rounds/${id}`, { method: "PUT", body })
        : await apiFetch("/rounds", { method: "POST", body });
      const failed: LocalFile[] = [];
      for (const f of pending) {
        try {
          await uploadAttachment(saved.round_id, f);
        } catch {
          failed.push(f);
        }
      }
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["rounds-for"] });
      qc.invalidateQueries({ queryKey: ["round", saved.round_id] });
      qc.invalidateQueries({ queryKey: ["attachments", saved.round_id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (failed.length) {
        // Round is saved; open it so the user can retry the failed uploads there.
        setPending([]);
        router.replace(`/round/${saved.round_id}` as any);
        return;
      }
      goBack(router, `/application/${form.application_id}`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!form.round_name && !!form.application_id && form.interview_types.length > 0 && !saving;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router, "/(tabs)/interviews")} style={styles.back} testID="round-back"><ArrowLeft color={colors.onSurface} size={22} /></Pressable>
        <Text style={styles.title}>{isEdit ? "Edit round" : "New interview round"}</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Field label="Round name *" value={form.round_name} onChangeText={(v: string) => set("round_name", v)} testID="field-round-name" />
          <Field label="Round number" value={String(form.round_number)} onChangeText={(v: string) => set("round_number", Number(v) || 1)} keyboardType="number-pad" />
          <Text style={styles.label}>Type (choose one or more)</Text>
          <ChipRow multi options={INTERVIEW_TYPES} value={form.interview_types} onChange={(v) => set("interview_types", v)} testID="round-type" />
          <Field label="Date (YYYY-MM-DD)" value={form.interview_date} onChangeText={(v: string) => set("interview_date", v)} />
          <Field label="Time" value={form.interview_time} onChangeText={(v: string) => set("interview_time", v)} />
          <Field label="Duration" value={form.duration} onChangeText={(v: string) => set("duration", v)} />
          <Field label="Interviewer name" value={form.interviewer_name} onChangeText={(v: string) => set("interviewer_name", v)} />
          <Field label="Interviewer designation" value={form.interviewer_designation} onChangeText={(v: string) => set("interviewer_designation", v)} />
          <Field label="Interviewer email" value={form.interviewer_email} onChangeText={(v: string) => set("interviewer_email", v)} autoCapitalize="none" keyboardType="email-address" />
          <Text style={styles.label}>Platform</Text>
          <ChipRow options={INTERVIEW_PLATFORMS} value={form.interview_platform} onChange={(v) => set("interview_platform", v)} testID="round-platform" />
          <Field label="Meeting link" value={form.meeting_link} onChangeText={(v: string) => set("meeting_link", v)} autoCapitalize="none" />
          <Text style={styles.label}>Status</Text>
          <ChipRow options={INTERVIEW_STATUSES} value={form.interview_status} onChange={(v) => set("interview_status", v)} testID="round-status" />
          <Text style={styles.label}>Result</Text>
          <ChipRow options={INTERVIEW_RESULTS} value={form.interview_result} onChange={(v) => set("interview_result", v)} testID="round-result" />
          <Text style={styles.label}>Difficulty</Text>
          <ChipRow options={DIFFICULTY_LEVELS} value={form.difficulty} onChange={(v) => set("difficulty", v)} testID="round-difficulty" />
          <Field label="Feedback" value={form.feedback} onChangeText={(v: string) => set("feedback", v)} multiline />
          <Field label="Personal notes" value={form.notes} onChangeText={(v: string) => set("notes", v)} multiline />

          <Text style={styles.label}>Attachments {pending.length ? `(${pending.length} to upload)` : ""}</Text>
          <View style={styles.uploadRow}>
            <Pressable onPress={() => addFiles("gallery")} style={styles.upBtn} testID="round-form-gallery"><Images color={colors.onBrandTertiary} size={18} weight="bold" /><Text style={styles.upText}>Gallery</Text></Pressable>
            <Pressable onPress={() => addFiles("camera")} style={styles.upBtn} testID="round-form-camera"><Camera color={colors.onBrandTertiary} size={18} weight="bold" /><Text style={styles.upText}>Camera</Text></Pressable>
            <Pressable onPress={() => addFiles("doc")} style={styles.upBtn} testID="round-form-doc"><FileText color={colors.onBrandTertiary} size={18} weight="bold" /><Text style={styles.upText}>Files</Text></Pressable>
          </View>
          {pending.length > 0 && (
            <View style={styles.thumbs}>
              {pending.map((f, i) => {
                const mt = f.mimeType || "";
                return (
                  <View key={`${f.uri}-${i}`} style={styles.thumb} testID={`pending-attachment-${i}`}>
                    {mt.startsWith("image/") ? (
                      <Image source={{ uri: f.uri }} style={styles.thumbImg} />
                    ) : (
                      <View style={styles.thumbIcon}>
                        {mt.startsWith("video/") ? <VideoCamera color={colors.brandPrimary} size={28} /> : <FileText color={colors.brandPrimary} size={28} />}
                        <Text style={styles.thumbName} numberOfLines={1}>{f.name}</Text>
                      </View>
                    )}
                    <Pressable onPress={() => setPending((p) => p.filter((_, j) => j !== i))} style={styles.removeBtn} hitSlop={10} testID={`remove-pending-${i}`}>
                      <X color={colors.onSurfaceInverse} size={12} weight="bold" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {error ? <Text style={{ color: colors.error }} testID="round-form-error">{error}</Text> : null}

          <Pressable onPress={onSave} disabled={!canSave} style={[styles.saveBtn, !canSave && { opacity: 0.5 }]} testID="save-round">
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.lg }}>{isEdit ? "Save changes" : "Create round"}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: c.onSurface },
  label: { fontSize: fontSize.sm, color: c.muted, fontWeight: "700", marginTop: spacing.sm },
  uploadRow: { flexDirection: "row", gap: spacing.sm },
  upBtn: { flex: 1, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: c.brandTertiary, borderRadius: radius.md },
  upText: { color: c.onBrandTertiary, fontWeight: "700", fontSize: fontSize.sm },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  thumbImg: { width: "100%", height: "100%" },
  thumbIcon: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xs },
  thumbName: { color: c.onSurface, fontSize: fontSize.sm, marginTop: 4 },
  removeBtn: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  saveBtn: { marginTop: spacing.lg, backgroundColor: c.brandPrimary, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center" },
}));
