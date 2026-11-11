import React from "react";
import { View, Text, Pressable, ScrollView, Image, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SignOut, Moon, Sun, Monitor, Envelope } from "phosphor-react-native";
import { useAuth } from "@/src/auth-context";
import { ExportCard } from "@/src/components/ExportCard";
import { makeStyles, spacing, radius, fontSize, useTheme, useThemePreference } from "@/src/theme";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.hero}>
          {user?.profile_image ? (
            <Image source={{ uri: user.profile_image }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: colors.onBrandPrimary, fontSize: 28, fontWeight: "800" }}>
                {user?.name?.[0]?.toUpperCase() ?? "U"}
              </Text>
            </View>
          )}
          <Text style={styles.name} testID="profile-name">{user?.name}</Text>
          <Text style={styles.email}>
            <Envelope color={colors.muted} size={14} />  {user?.email}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.segment}>
            {(["light", "dark", "system"] as const).map((opt) => {
              const selected = preference === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setPreference(opt)}
                  style={[
                    styles.segmentBtn,
                    { backgroundColor: selected ? colors.brandPrimary : "transparent" },
                  ]}
                  testID={`theme-${opt}`}
                >
                  {opt === "light" ? <Sun size={16} color={selected ? colors.onBrandPrimary : colors.onSurface} /> : opt === "dark" ? <Moon size={16} color={selected ? colors.onBrandPrimary : colors.onSurface} /> : <Monitor size={16} color={selected ? colors.onBrandPrimary : colors.onSurface} />}
                  <Text style={{ color: selected ? colors.onBrandPrimary : colors.onSurface, fontWeight: "600", textTransform: "capitalize" }}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export</Text>
          <ExportCard />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Pressable style={styles.row} onPress={logout} testID="profile-logout">
            <View style={[styles.rowIcon, { backgroundColor: colors.error + "22" }]}>
              <SignOut color={colors.error} size={20} weight="bold" />
            </View>
            <Text style={[styles.rowText, { color: colors.error }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  hero: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm, backgroundColor: c.surfaceSecondary, marginBottom: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  name: { fontSize: fontSize.xxl, fontWeight: "800", color: c.onSurface, marginTop: spacing.sm },
  email: { fontSize: fontSize.base, color: c.muted },
  section: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.sm, color: c.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  segment: { flexDirection: "row", gap: spacing.xs, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, padding: 4 },
  segmentBtn: { flex: 1, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.pill },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border },
  rowIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rowText: { fontSize: fontSize.base, fontWeight: "700" },
}));
