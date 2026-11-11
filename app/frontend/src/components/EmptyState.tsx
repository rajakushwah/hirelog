import React from "react";
import { View, Text, Pressable } from "react-native";
import { makeStyles, spacing, radius, fontSize } from "../theme";

export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.circle} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.btn} testID={`${testID}-cta`}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md, flex: 1 },
  circle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: c.brandTertiary,
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  sub: { fontSize: fontSize.base, color: c.muted, textAlign: "center", maxWidth: 280 },
  btn: {
    marginTop: spacing.md,
    backgroundColor: c.brandPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  btnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: fontSize.base },
}));
