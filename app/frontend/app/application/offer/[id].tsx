import React, { useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { ArrowLeft, ShareNetwork, Confetti, Copy } from "phosphor-react-native";

import { apiFetch } from "@/src/api";
import { goBack } from "@/src/nav";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

// The shared image must look the same whatever theme the user has on, so the card uses fixed brand colors.
const CARD = { deep: "#1F3A28", brand: "#2E523A", coral: "#E27357", cream: "#FFF8F1", soft: "#CFE3D6" };

function daysBetween(from?: string, to?: string): number | null {
  if (!from) return null;
  const a = new Date(from.slice(0, 10)).getTime();
  const b = to ? new Date(to.slice(0, 10)).getTime() : Date.now();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export default function OfferCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const { data: app } = useQuery<any>({ queryKey: ["app", id], queryFn: () => apiFetch(`/applications/${id}`) });
  const { data: rounds } = useQuery<any[]>({ queryKey: ["rounds-for", id], queryFn: () => apiFetch(`/rounds?application_id=${id}`) });
  const { data: questions } = useQuery<any[]>({ queryKey: ["questions"], queryFn: () => apiFetch(`/questions`) });

  if (!app || !rounds) {
    return <View style={[styles.wrap, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const days = daysBetween(app.applied_date, app.offer_date || app.updated_at);
  const qCount = (questions ?? []).filter((q) => q.application_id === id).length;
  const passed = rounds.filter((r) => r.interview_result === "Passed").length;
  const accepted = app.application_status === "Offer Accepted";
  const headline = accepted ? "I'm starting a new position!" : "I received an offer!";

  const postText =
    `${headline} 🎉\n\nThrilled to share that I ${accepted ? "have accepted an offer" : "received an offer"} from ${app.company_name} for the role of ${app.job_role}.\n\n` +
    `My journey: ${rounds.length} interview round${rounds.length === 1 ? "" : "s"}${days !== null ? ` over ${days} day${days === 1 ? "" : "s"}` : ""}` +
    `${qCount ? `, ${qCount} question${qCount === 1 ? "" : "s"} tackled` : ""}.\n\nGrateful to everyone who supported me along the way! #NewJob #Hiring #CareerGrowth`;

  // Web: copy to clipboard (desktop browsers have no share sheet).
  const copyOnWeb = async (): Promise<boolean> => {
    try {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      if (nav?.share) {
        await nav.share({ text: postText });
        return true;
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(postText);
        setNote("Post text copied. Paste it into LinkedIn.");
        return true;
      }
    } catch {}
    setNote("Select the suggested post below and copy it.");
    return false;
  };

  const shareImage = async () => {
    setSharing(true);
    setNote(null);
    try {
      if (Platform.OS === "web") {
        await copyOnWeb();
        setNote((n) => (n ? `${n} Image sharing works in the mobile app.` : "Image sharing works in the mobile app."));
        return;
      }
      const uri = await captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your offer", UTI: "public.png" });
        setNote("Tip: use Share post text for your LinkedIn caption.");
      } else {
        await Share.share({ message: postText });
      }
    } catch {
      setNote("Couldn't create the image. Please try again.");
    } finally {
      setSharing(false);
    }
  };

  const shareText = async () => {
    if (Platform.OS === "web") {
      await copyOnWeb();
      return;
    }
    try {
      await Share.share({ message: postText });
    } catch {
      setNote("Couldn't open sharing. Please try again.");
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router, `/application/${id}`)} style={styles.back} testID="offer-card-back"><ArrowLeft color={colors.onSurface} size={22} /></Pressable>
        <Text style={styles.title}>Share your offer</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}>
        <View ref={cardRef} collapsable={false} style={styles.cardShell} testID="offer-card">
          <LinearGradient colors={[CARD.deep, CARD.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.badge}>
              <Confetti color={CARD.deep} size={16} weight="fill" />
              <Text style={styles.badgeText}>{accepted ? "OFFER ACCEPTED" : "OFFER RECEIVED"}</Text>
            </View>
            <Text style={styles.headline}>{headline}</Text>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.company} numberOfLines={2} testID="offer-card-company">{app.company_name}</Text>
              <Text style={styles.role} numberOfLines={2}>{app.job_role}</Text>
            </View>

            <View style={styles.stats}>
              <Stat value={String(rounds.length)} label={rounds.length === 1 ? "round" : "rounds"} />
              <View style={styles.statDivider} />
              <Stat value={days !== null ? String(days) : "—"} label="days to offer" />
              <View style={styles.statDivider} />
              <Stat value={String(qCount)} label={qCount === 1 ? "question" : "questions"} />
            </View>

            {rounds.length > 0 ? (
              <View style={styles.journey}>
                {rounds.slice(0, 6).map((r, i) => (
                  <View key={r.round_id} style={styles.step}>
                    <View style={[styles.dot, r.interview_result === "Passed" && { backgroundColor: CARD.coral }]}>
                      <Text style={styles.dotText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.stepText} numberOfLines={1}>{r.round_name}</Text>
                  </View>
                ))}
                {rounds.length > 6 ? <Text style={styles.more}>+{rounds.length - 6} more rounds</Text> : null}
              </View>
            ) : null}

            <Text style={styles.footer}>
              {passed ? `${passed} round${passed === 1 ? "" : "s"} cleared · ` : ""}Tracked with Interview Tracker
            </Text>
          </LinearGradient>
        </View>

        <Pressable style={styles.primary} onPress={shareImage} disabled={sharing} testID="offer-share-image-button">
          {sharing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><ShareNetwork color={colors.onBrandPrimary} size={18} weight="bold" /><Text style={styles.primaryText}>Share image</Text></>}
        </Pressable>
        <Pressable style={styles.secondary} onPress={shareText} testID="offer-share-text-button">
          <Copy color={colors.onSurface} size={18} />
          <Text style={styles.secondaryText}>Share post text</Text>
        </Pressable>
        {note ? <Text style={styles.note} testID="offer-share-note">{note}</Text> : null}

        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Suggested LinkedIn post</Text>
          <Text style={styles.previewText} selectable testID="offer-post-text">{postText}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: c.onSurface },
  cardShell: { borderRadius: radius.lg, overflow: "hidden", width: "100%", maxWidth: 480, alignSelf: "center" },
  card: { padding: spacing.xl, gap: spacing.lg },
  badge: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: spacing.xs, backgroundColor: CARD.soft, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  badgeText: { color: CARD.deep, fontWeight: "800", fontSize: fontSize.sm, letterSpacing: 1 },
  headline: { color: CARD.coral, fontSize: fontSize.lg, fontWeight: "800" },
  company: { color: CARD.cream, fontSize: 34, fontWeight: "800", letterSpacing: -0.5, lineHeight: 38 },
  role: { color: CARD.soft, fontSize: fontSize.lg, fontWeight: "600" },
  stats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.md, paddingVertical: spacing.md },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: CARD.cream, fontSize: fontSize.xxl, fontWeight: "800" },
  statLabel: { color: CARD.soft, fontSize: fontSize.sm },
  statDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.15)" },
  journey: { gap: spacing.sm },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  dotText: { color: CARD.cream, fontSize: fontSize.sm, fontWeight: "800" },
  stepText: { color: CARD.cream, fontSize: fontSize.base, flex: 1 },
  more: { color: CARD.soft, fontSize: fontSize.sm, marginLeft: 36 },
  footer: { color: CARD.soft, fontSize: fontSize.sm, marginTop: spacing.sm },
  primary: { flexDirection: "row", gap: spacing.sm, height: 52, borderRadius: radius.pill, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: fontSize.lg },
  secondary: { flexDirection: "row", gap: spacing.sm, height: 48, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: c.onSurface, fontWeight: "700", fontSize: fontSize.base },
  note: { color: c.muted, fontSize: fontSize.sm, textAlign: "center" },
  preview: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  previewLabel: { fontSize: fontSize.sm, color: c.muted, fontWeight: "700" },
  previewText: { fontSize: fontSize.base, color: c.onSurface, lineHeight: 20 },
}));
