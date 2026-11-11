import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { colors } = useTheme();
  // Root layout gate handles navigation; this is just a transient splash.
  return (
    <View style={[styles.c, { backgroundColor: colors.surface }]}>
      <ActivityIndicator color={colors.brandPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: "center", justifyContent: "center" },
});
