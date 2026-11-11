import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { LogBox, StyleSheet, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { PrefContext, useThemeState, useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function Gate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(tabs)" || segments[0] === "application" || segments[0] === "round" || segments[0] === "question";
    if (user && !inAuthGroup) {
      router.replace("/(tabs)" as any);
    } else if (!user && inAuthGroup) {
      router.replace("/login" as any);
    } else if (!user && segments[0] !== "login") {
      router.replace("/login" as any);
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

function ThemedShell() {
  const themeState = useThemeState();
  return (
    <PrefContext.Provider value={{ preference: themeState.preference, setPreference: themeState.setPreference }}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </PrefContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <ThemedShell />
            </KeyboardProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
