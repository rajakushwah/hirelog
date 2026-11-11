import React from "react";
import { View, Text, TextInput, TextInputProps, StyleSheet } from "react-native";
import { makeStyles, spacing, radius, fontSize, useTheme } from "../theme";

export function Field({
  label,
  testID,
  ...props
}: TextInputProps & { label: string; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        testID={testID}
        {...props}
        style={[styles.input, props.multiline && styles.multi]}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, color: c.muted, fontWeight: "600" },
  input: {
    backgroundColor: c.surfaceTertiary,
    color: c.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  multi: { minHeight: 96, textAlignVertical: "top" },
}));
