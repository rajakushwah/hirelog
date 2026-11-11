import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, Linking, StyleSheet } from "react-native";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PencilSimple, Trash, Plus, Images, Camera, FileText, LinkSimple, VideoCamera, X } from "phosphor-react-native";

import { apiFetch, fileUrl, getToken } from "@/src/api";
import { pickFiles, uploadAttachment, PickKind } from "@/src/attachments";
import { goBack } from "@/src/nav";
import { StatusBadge } from "@/src/components/StatusBadge";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

export default function RoundDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  React.useEffect(() => { getToken().then(setToken); }, []);

  const { data: round, isLoading } = useQuery<any>({
    queryKey: ["round", id],
    queryFn: () => apiFetch<any>(`/rounds/${id}`),
  });
  const { data: questions } = useQuery<any[]>({
    queryKey: ["questions-for", id],
    queryFn: () => apiFetch<any[]>(`/questions?round_id=${id}`),
  });
  const { data: attachments } = useQuery<any[]>({
    queryKey: ["attachments", id],
    queryFn: () => apiFetch<any[]>(`/attachments?round_id=${id}`),
  });

  const del = useMutation({
    mutationFn: () => apiFetch(`/rounds/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      qc.invalidateQueries({ queryKey: ["rounds-for"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      goBack(router, round?.application_id ? `/application/${round.application_id}` : "/(tabs)/interviews");
    },
  });

  const delQ = useMutation({
    mutationFn: (qid: string) => apiFetch(`/questions/${qid}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions-for", id] }),
  });

  // confirm target: "round" or a question_id
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const confirmDelete = () => setConfirmTarget("round");

  const delA = useMutation({
    mutationFn: (aid: string) => apiFetch(`/attachments/${aid}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attachments", id] }),
  });

  const pickAndUpload = async (kind: PickKind) => {
    setUploadError(null);
    try {
      const r = await pickFiles(kind);
      if (r.error) setUploadError(r.error);
      if (!r.files.length) return;
      setUploading(true);
      for (const f of r.files) await uploadAttachment(String(id), f);
      qc.invalidateQueries({ queryKey: ["attachments", id] });
    } catch (e: any) {
      setUploadError(`Upload failed: ${String(e?.message ?? e)}`);
    } finally {
      setUploading(false);
    }
  };

  if (isLoading || !round) {
    return <View style={[styles.wrap, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router, "/(tabs)/interviews")} style={styles.back} testID="round-detail-back"><ArrowLeft color={colors.onSurface} size={22} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push(`/round/new?id=${round.round_id}` as any)} style={styles.back} testID="edit-round"><PencilSimple color={colors.onSurface} size={20} /></Pressable>
        <Pressable onPress={confirmDelete} style={styles.back} testID="delete-round"><Trash color={colors.error} size={20} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}>
        <Text style={styles.company}>{round.company_name}</Text>
        <Text style={styles.roundName}>R{round.round_number} · {round.round_name}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
          <StatusBadge status={round.interview_status} kind="interview" />
          <StatusBadge status={round.interview_result} kind="result" />
          <StatusBadge status={round.difficulty || "Medium"} kind="difficulty" />
        </View>

        <View style={styles.card}>
          <Row label="Type" value={round.interview_type} />
          <Row label="Date" value={round.interview_date || "—"} />
          <Row label="Time" value={round.interview_time || "—"} />
          <Row label="Duration" value={round.duration || "—"} />
          <Row label="Interviewer" value={`${round.interviewer_name || "—"} ${round.interviewer_designation ? `(${round.interviewer_designation})` : ""}`} />
          <Row label="Email" value={round.interviewer_email || "—"} />
          <Row label="Platform" value={round.interview_platform || "—"} />
          {round.meeting_link ? (
            <Pressable onPress={() => Linking.openURL(round.meeting_link)} style={styles.linkRow} testID="meeting-link">
              <LinkSimple color={colors.brandPrimary} size={16} />
              <Text style={{ color: colors.brandPrimary, fontWeight: "600" }} numberOfLines={1}>{round.meeting_link}</Text>
            </Pressable>
          ) : null}
          {round.feedback ? <Row label="Feedback" value={round.feedback} multi /> : null}
          {round.notes ? <Row label="Notes" value={round.notes} multi /> : null}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.section}>Questions ({questions?.length ?? 0})</Text>
          <Pressable onPress={() => router.push(`/question/new?round_id=${round.round_id}` as any)} style={styles.addBtn} testID="add-question">
            <Plus color={colors.onBrandPrimary} size={14} weight="bold" />
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.sm }}>Add</Text>
          </Pressable>
        </View>
        {(questions?.length ?? 0) === 0 ? (
          <Text style={styles.empty}>No questions logged yet.</Text>
        ) : (
          <View style={{ gap: spacing.md }}>
            {questions!.map((q) => (
              <View key={q.question_id} style={styles.qCard}>
                <View style={styles.rowBetween}>
                  <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: fontSize.sm }}>{q.category}</Text>
                  <StatusBadge status={q.difficulty} kind="difficulty" />
                </View>
                <Text style={styles.qText}>{q.question}</Text>
                {q.answer ? <Text style={styles.qAnswer}>{q.answer}</Text> : null}
                <Pressable onPress={() => setConfirmTarget(q.question_id)} style={styles.removeLink} testID={`remove-question-${q.question_id}`}><Text style={{ color: colors.error, fontSize: fontSize.sm, fontWeight: "600" }}>Remove</Text></Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.sectionHead}>
          <Text style={styles.section}>Attachments ({attachments?.length ?? 0})</Text>
        </View>
        <View style={styles.uploadRow}>
          <Pressable onPress={() => pickAndUpload("gallery")} style={styles.upBtn} testID="upload-gallery"><Images color={colors.onBrandTertiary} size={18} weight="bold" /><Text style={styles.upText}>Gallery</Text></Pressable>
          <Pressable onPress={() => pickAndUpload("camera")} style={styles.upBtn} testID="upload-camera"><Camera color={colors.onBrandTertiary} size={18} weight="bold" /><Text style={styles.upText}>Camera</Text></Pressable>
          <Pressable onPress={() => pickAndUpload("doc")} style={styles.upBtn} testID="upload-doc"><FileText color={colors.onBrandTertiary} size={18} weight="bold" /><Text style={styles.upText}>Files</Text></Pressable>
        </View>
        {uploading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.md }} /> : null}
        {uploadError ? <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="upload-error">{uploadError}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md }}>
          {(attachments ?? []).map((a) => {
            const ft = a.file_type || "";
            const url = fileUrl(a.attachment_id, token);
            return (
              <Pressable key={a.attachment_id} style={styles.thumb} onPress={() => Linking.openURL(url)} testID={`attachment-${a.attachment_id}`}>
                {ft.startsWith("image/") ? (
                  <Image source={{ uri: url }} style={{ width: "100%", height: "100%", borderRadius: radius.md }} />
                ) : (
                  <View style={{ alignItems: "center", justifyContent: "center", flex: 1, padding: spacing.xs }}>
                    {ft.startsWith("video/") ? <VideoCamera color={colors.brandPrimary} size={28} /> : <FileText color={colors.brandPrimary} size={28} />}
                    <Text style={{ color: colors.onSurface, fontSize: fontSize.sm, marginTop: 4 }} numberOfLines={1}>{a.file_name}</Text>
                  </View>
                )}
                <Pressable onPress={() => setConfirmTarget(`att:${a.attachment_id}`)} style={styles.thumbX} hitSlop={10} testID={`delete-attachment-${a.attachment_id}`}>
                  <X color={colors.onSurfaceInverse} size={12} weight="bold" />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <ConfirmSheet
        visible={!!confirmTarget}
        title={confirmTarget === "round" ? "Delete round?" : confirmTarget?.startsWith("att:") ? "Delete attachment?" : "Delete question?"}
        message={confirmTarget === "round" ? "This also removes its questions and attachments." : undefined}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          const t = confirmTarget;
          setConfirmTarget(null);
          if (t === "round") del.mutate();
          else if (t?.startsWith("att:")) delA.mutate(t.slice(4));
          else if (t) delQ.mutate(t);
        }}
      />
    </View>
  );
}

function Row({ label, value, multi }: { label: string; value: string; multi?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, multi && { flexDirection: "column", alignItems: "flex-start", gap: spacing.xs }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowVal, multi && { textAlign: "left" }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  company: { fontSize: fontSize.lg, color: c.brandPrimary, fontWeight: "700" },
  roundName: { fontSize: fontSize.xxl, fontWeight: "800", color: c.onSurface, marginTop: spacing.xs, letterSpacing: -0.5 },
  card: { marginTop: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, gap: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  rowLabel: { fontSize: fontSize.sm, color: c.muted, fontWeight: "600" },
  rowVal: { fontSize: fontSize.base, color: c.onSurface, flex: 1, textAlign: "right" },
  linkRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md },
  section: { fontSize: fontSize.lg, fontWeight: "800", color: c.onSurface },
  addBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.pill },
  removeLink: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingRight: spacing.lg },
  thumbX: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  qCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qText: { fontSize: fontSize.base, color: c.onSurface, fontWeight: "600", lineHeight: 20 },
  qAnswer: { fontSize: fontSize.base, color: c.onSurfaceSecondary, lineHeight: 20 },
  empty: { color: c.muted, textAlign: "center", paddingVertical: spacing.lg },
  uploadRow: { flexDirection: "row", gap: spacing.sm },
  upBtn: { flex: 1, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: c.brandTertiary, borderRadius: radius.md },
  upText: { color: c.onBrandTertiary, fontWeight: "700", fontSize: fontSize.sm },
  thumb: { width: 100, height: 100, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
}));
