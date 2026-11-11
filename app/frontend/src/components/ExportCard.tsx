import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Table, FilePdf } from "phosphor-react-native";

import { downloadAndShare, today } from "../exports";
import { makeStyles, spacing, radius, fontSize, useTheme } from "../theme";

export function ExportCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<null | "sheet" | "pdf">(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const run = async (kind: "sheet" | "pdf") => {
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "sheet") {
        await downloadAndShare("/export/sheet", `InterviewTracker_All_${today()}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        await downloadAndShare("/export/pdf", `InterviewTracker_Report_${today()}.pdf`, "application/pdf");
      }
      setMsg({ text: kind === "sheet" ? "Spreadsheet ready. Open it with Google Sheets or save it to Drive." : "PDF report ready.", ok: true });
    } catch {
      setMsg({ text: "Couldn't create the file. Check your connection and try again.", ok: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card} testID="export-card">
      <Pressable style={styles.row} onPress={() => run("sheet")} disabled={!!busy} testID="export-sheet-button">
        <View style={styles.icon}><Table color={colors.onBrandTertiary} size={20} weight="bold" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Export everything</Text>
          <Text style={styles.sub}>All applications, rounds, questions and attachments in separate tabs. To share one company only, use Export on that application.</Text>
        </View>
        {busy === "sheet" ? <ActivityIndicator color={colors.brandPrimary} /> : null}
      </Pressable>
      <View style={styles.divider} />
      <Pressable style={styles.row} onPress={() => run("pdf")} disabled={!!busy} testID="export-pdf-button">
        <View style={styles.icon}><FilePdf color={colors.onBrandTertiary} size={20} weight="bold" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Full PDF report</Text>
          <Text style={styles.sub}>Your full interview journey, with image and PDF attachments included.</Text>
        </View>
        {busy === "pdf" ? <ActivityIndicator color={colors.brandPrimary} /> : null}
      </Pressable>
      {msg ? <Text style={[styles.msg, { color: msg.ok ? colors.success : colors.error }]} testID="export-message">{msg.text}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center", padding: spacing.lg, minHeight: 64 },
  icon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: fontSize.base, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: c.divider, marginLeft: spacing.lg + 36 + spacing.md },
  msg: { fontSize: fontSize.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
}));
