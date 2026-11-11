import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleLogo, Briefcase } from "phosphor-react-native";
import { useAuth } from "@/src/auth-context";
import { makeStyles, spacing, radius, fontSize, useTheme } from "@/src/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, loading } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const [pending, setPending] = React.useState(false);

  const onSignIn = async () => {
    setPending(true);
    try {
      await signInWithGoogle();
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <Briefcase color={colors.onBrandPrimary} weight="fill" size={36} />
        </View>
        <Text style={styles.title} testID="login-title">Interview Tracker</Text>
        <Text style={styles.sub}>
          Track every application, round, question and offer — in one calm workspace.
        </Text>
      </View>

      <View style={styles.bottom}>
        <Pressable
          onPress={onSignIn}
          disabled={pending || loading}
          style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85 }]}
          testID="login-google-button"
        >
          {pending ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : (
            <>
              <GoogleLogo color={colors.onSurface} weight="bold" size={22} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.terms}>
          By continuing you agree to let Interview Tracker store your job-search data in your private account.
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface, paddingHorizontal: spacing.xl, justifyContent: "space-between" },
  hero: { alignItems: "center", gap: spacing.lg, paddingTop: spacing.xxxl },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xxxl, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: fontSize.lg, color: c.muted, textAlign: "center", maxWidth: 320, lineHeight: 22 },
  bottom: { gap: spacing.md, alignItems: "center" },
  googleBtn: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    width: "100%",
  },
  googleText: { color: c.onSurface, fontWeight: "700", fontSize: fontSize.lg },
  terms: { color: c.muted, fontSize: fontSize.sm, textAlign: "center", paddingHorizontal: spacing.lg },
}));
