import React, { useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Table, FilePdf } from "phosphor-react-native";

import { downloadAndShare, today, safeName, XLSX_MIME, PDF_MIME } from "../exports";
import { makeStyles, spacing, radius, fontSize, useTheme } from "../theme";

// Bottom sheet to export ONE application (its rounds, questions and attachments only).
export function ExportApplicationSheet({
  visible,
  onClose,
  applicationId,
  companyName,
}: {
  visible: boolean;
  onClose: () => void;
  applicationId: string;
  companyName: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<null | "sheet" | "pdf">(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const run = async (kind: "sheet" | "pdf") => {
    setBusy(kind);
    setMsg(null);
    const base = `InterviewTracker_${safeName(companyName)}_${today()}`;
    const appQ = encodeURIComponent(applicationId);
    try {
      if (kind === "sheet") await downloadAndShare(`/export/sheet?application_id=${appQ}`, `${base}.xlsx`, XLSX_MIME);
      else await downloadAndShare(`/export/pdf?application_id=${appQ}`, `${base}.pdf`, PDF_MIME);
      setMsg({ text: `${kind === "sheet" ? "Spreadsheet" : "PDF"} for ${companyName} is ready.`, ok: true });
    } catch {
      setMsg({ text: "Couldn't create the file. Check your connection and try again.", ok: false });
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    if (busy) return;
    setMsg(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} testID="export-app-backdrop">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Export {companyName}</Text>
          <Text style={styles.sub}>Only this application, its interview rounds, questions and attachments are included.</Text>

          <Pressable style={styles.option} onPress={() => run("sheet")} disabled={!!busy} testID="export-app-sheet-button">
            <View style={styles.icon}><Table color={colors.onBrandTertiary} size={20} weight="bold" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optTitle}>Excel spreadsheet</Text>
              <Text style={styles.optSub}>Opens in Excel or Google Sheets</Text>
            </View>
            {busy === "sheet" ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          </Pressable>

          <Pressable style={styles.option} onPress={() => run("pdf")} disabled={!!busy} testID="export-app-pdf-button">
            <View style={styles.icon}><FilePdf color={colors.onBrandTertiary} size={20} weight="bold" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optTitle}>PDF report</Text>
              <Text style={styles.optSub}>Full interview experience with image and PDF attachments</Text>
            </View>
            {busy === "pdf" ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          </Pressable>

          {msg ? <Text style={{ color: msg.ok ? colors.success : colors.error, fontSize: fontSize.sm }} testID="export-app-message">{msg.text}</Text> : null}

          <Pressable style={styles.cancel} onPress={close} testID="export-app-close">
            <Text style={styles.cancelText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: spacing.xs },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: fontSize.sm, color: c.muted },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, minHeight: 64, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  icon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  optTitle: { fontSize: fontSize.base, fontWeight: "700", color: c.onSurface },
  optSub: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
  cancel: { height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, marginTop: spacing.xs },
  cancelText: { color: c.onSurface, fontWeight: "700", fontSize: fontSize.base },
}));
