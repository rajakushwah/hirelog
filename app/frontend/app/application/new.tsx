import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { goBack } from "@/src/nav";
import { Field } from "@/src/components/Field";
import { ChipRow } from "@/src/components/ChipRow";
import { APPLICATION_STATUSES, JOB_SOURCES, JOB_TYPES } from "@/src/constants";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

export default function ApplicationForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const isEdit = !!id;

  const [form, setForm] = useState<any>({
    company_name: "",
    company_website: "",
    job_role: "",
    job_description: "",
    job_location: "",
    job_type: "Full-time",
    employment_type: "",
    applied_date: new Date().toISOString().slice(0, 10),
    job_source: "LinkedIn",
    recruiter_name: "",
    recruiter_email: "",
    recruiter_phone: "",
    expected_ctc: "",
    offered_ctc: "",
    notice_period: "",
    application_status: "Applied",
  });

  const { data: existing } = useQuery<any>({
    queryKey: ["app-edit", id],
    queryFn: () => apiFetch<any>(`/applications/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) setForm((f: any) => ({ ...f, ...existing }));
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      if (isEdit) return apiFetch(`/applications/${id}`, { method: "PUT", body: JSON.stringify(form) });
      return apiFetch("/applications", { method: "POST", body: JSON.stringify(form) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["app", id] });
      goBack(router, "/(tabs)/applications");
    },
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router, "/(tabs)/applications")} style={styles.back} testID="form-back"><ArrowLeft color={colors.onSurface} size={22} /></Pressable>
        <Text style={styles.title}>{isEdit ? "Edit application" : "New application"}</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md }}>
          <Field label="Company name *" value={form.company_name} onChangeText={(v: string) => set("company_name", v)} testID="field-company" />
          <Field label="Job role *" value={form.job_role} onChangeText={(v: string) => set("job_role", v)} testID="field-role" />
          <Field label="Location" value={form.job_location} onChangeText={(v: string) => set("job_location", v)} />
          <Field label="Company website" value={form.company_website} onChangeText={(v: string) => set("company_website", v)} autoCapitalize="none" />
          <Text style={styles.label}>Job type</Text>
          <ChipRow options={JOB_TYPES} value={form.job_type} onChange={(v) => set("job_type", v)} />
          <Text style={styles.label}>Source</Text>
          <ChipRow options={JOB_SOURCES} value={form.job_source} onChange={(v) => set("job_source", v)} />
          <Text style={styles.label}>Status</Text>
          <ChipRow options={APPLICATION_STATUSES} value={form.application_status} onChange={(v) => set("application_status", v)} />

          <Field label="Applied date (YYYY-MM-DD)" value={form.applied_date} onChangeText={(v: string) => set("applied_date", v)} testID="field-date" />
          <Field label="Recruiter name" value={form.recruiter_name} onChangeText={(v: string) => set("recruiter_name", v)} />
          <Field label="Recruiter email" value={form.recruiter_email} onChangeText={(v: string) => set("recruiter_email", v)} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Recruiter phone" value={form.recruiter_phone} onChangeText={(v: string) => set("recruiter_phone", v)} keyboardType="phone-pad" />
          <Field label="Expected CTC" value={form.expected_ctc} onChangeText={(v: string) => set("expected_ctc", v)} />
          <Field label="Offered CTC" value={form.offered_ctc} onChangeText={(v: string) => set("offered_ctc", v)} />
          <Field label="Notice period" value={form.notice_period} onChangeText={(v: string) => set("notice_period", v)} />
          <Field label="Description / notes" value={form.job_description} onChangeText={(v: string) => set("job_description", v)} multiline />

          <Pressable
            onPress={() => save.mutate()}
            disabled={!form.company_name || !form.job_role || save.isPending}
            style={[styles.saveBtn, (!form.company_name || !form.job_role) && { opacity: 0.5 }]}
            testID="save-application"
          >
            {save.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: fontSize.lg }}>{isEdit ? "Save changes" : "Create application"}</Text>}
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
