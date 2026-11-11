import React from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { goBack } from "@/src/nav";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Plus, PencilSimple, Trash, Confetti, Export } from "phosphor-react-native";
import { ExportApplicationSheet } from "@/src/components/ExportApplicationSheet";

import { apiFetch } from "@/src/api";
import { StatusBadge } from "@/src/components/StatusBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

export default function ApplicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const { data: app, isLoading } = useQuery<any>({
    queryKey: ["app", id],
    queryFn: () => apiFetch<any>(`/applications/${id}`),
  });
  const { data: rounds } = useQuery<any[]>({
    queryKey: ["rounds-for", id],
    queryFn: () => apiFetch<any[]>(`/rounds?application_id=${id}`),
  });

  const del = useMutation({
    mutationFn: () => apiFetch(`/applications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      goBack(router, "/(tabs)/applications");
    },
  });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const confirmDelete = () => setConfirmOpen(true);

  if (isLoading || !app) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router, "/(tabs)/applications")} style={styles.backBtn} testID="back-btn"><ArrowLeft color={colors.onSurface} size={22} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setExportOpen(true)} style={styles.exportBtn} testID="app-export-btn">
          <Export color={colors.onBrandTertiary} size={18} weight="bold" />
          <Text style={styles.exportText}>Export</Text>
        </Pressable>
        <Pressable onPress={() => router.push(`/application/new?id=${app.application_id}` as any)} style={styles.backBtn} testID="edit-btn"><PencilSimple color={colors.onSurface} size={20} /></Pressable>
        <Pressable onPress={confirmDelete} style={styles.backBtn} testID="delete-btn"><Trash color={colors.error} size={20} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl, paddingHorizontal: spacing.xl }}>
        <View style={styles.hero}>
          <Text style={styles.company}>{app.company_name}</Text>
          <Text style={styles.role}>{app.job_role}</Text>
          <StatusBadge status={app.application_status} kind="application" />
        </View>

        {app.application_status === "Offer Received" || app.application_status === "Offer Accepted" ? (
          <Pressable style={styles.offerBanner} onPress={() => router.push(`/application/offer/${app.application_id}` as any)} testID="share-offer-button">
            <Confetti color={colors.onBrandSecondary} size={22} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={styles.offerTitle}>Congratulations!</Text>
              <Text style={styles.offerSub}>Create a card to share your offer on LinkedIn</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <Row label="Location" value={app.job_location || "—"} />
          <Row label="Job type" value={app.job_type || "—"} />
          <Row label="Source" value={app.job_source || "—"} />
          <Row label="Applied on" value={app.applied_date || "—"} />
          <Row label="Recruiter" value={app.recruiter_name || "—"} />
          <Row label="Recruiter email" value={app.recruiter_email || "—"} />
          <Row label="Expected CTC" value={app.expected_ctc || "—"} />
          <Row label="Offered CTC" value={app.offered_ctc || "—"} />
          <Row label="Notice period" value={app.notice_period || "—"} />
          {app.job_description ? <Row label="Description" value={app.job_description} multi /> : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Interview rounds</Text>
          <Pressable onPress={() => router.push(`/round/new?application_id=${app.application_id}&round_number=${(rounds?.length ?? 0) + 1}` as any)} style={styles.addBtn} testID="add-round">
            <Plus color={colors.onBrandPrimary} size={16} weight="bold" />
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>Add round</Text>
          </Pressable>
        </View>

        {(rounds?.length ?? 0) === 0 ? (
          <EmptyState title="No rounds yet" subtitle="Schedule your first interview round." testID="rounds-empty-app" />
        ) : (
          <View style={{ gap: spacing.md }}>
            {rounds!.map((r, idx) => (
              <Pressable key={r.round_id} style={styles.timelineRow} onPress={() => router.push(`/round/${r.round_id}` as any)} testID={`round-${r.round_id}`}>
                <View style={styles.dotCol}>
                  <View style={styles.dot}><Text style={styles.dotText}>{r.round_number}</Text></View>
                  {idx < rounds!.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.roundCard}>
                  <Text style={styles.roundName}>{r.round_name}</Text>
                  <Text style={styles.roundMeta}>{r.interview_type} · {r.interview_date || "—"} {r.interview_time}</Text>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, flexWrap: "wrap" }}>
                    <StatusBadge status={r.interview_status} kind="interview" />
                    <StatusBadge status={r.interview_result} kind="result" />
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
      <ConfirmSheet
        visible={confirmOpen}
        title="Delete application?"
        message="This removes all its rounds, questions and attachments."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); del.mutate(); }}
      />
      <ExportApplicationSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        applicationId={app.application_id}
        companyName={app.company_name}
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
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.brandTertiary, marginRight: spacing.xs },
  exportText: { color: c.onBrandTertiary, fontWeight: "700", fontSize: fontSize.sm },
  hero: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  offerBanner: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.brandSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  offerTitle: { color: c.onBrandSecondary, fontWeight: "800", fontSize: fontSize.lg },
  offerSub: { color: c.onBrandSecondary, fontSize: fontSize.sm, marginTop: 2 },
  company: { fontSize: fontSize.xxxl, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  role: { fontSize: fontSize.lg, color: c.onSurfaceSecondary, marginBottom: spacing.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, gap: spacing.md, marginBottom: spacing.xl },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  rowLabel: { fontSize: fontSize.sm, color: c.muted, fontWeight: "600" },
  rowVal: { fontSize: fontSize.base, color: c.onSurface, flex: 1, textAlign: "right" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: c.onSurface },
  addBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  timelineRow: { flexDirection: "row", gap: spacing.md },
  dotCol: { alignItems: "center", width: 32 },
  dot: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  dotText: { color: c.onBrandPrimary, fontWeight: "800" },
  line: { width: 2, flex: 1, backgroundColor: c.border, marginTop: spacing.xs },
  roundCard: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, marginBottom: spacing.sm },
  roundName: { fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface },
  roundMeta: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
}));
