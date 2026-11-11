import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme, statusColor, fontSize, radius, spacing } from "../theme";

type Kind = "application" | "interview" | "result" | "difficulty";
export function StatusBadge({ status, kind, testID }: { status: string; kind: Kind; testID?: string }) {
  const { colors } = useTheme();
  const { bg, fg } = statusColor(colors, status, kind);
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  text: { fontSize: fontSize.sm, fontWeight: "600" },
});
