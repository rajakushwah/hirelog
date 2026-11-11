import React from "react";
import { Tabs } from "expo-router";
import { House, Briefcase, CalendarBlank, Question, User } from "phosphor-react-native";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <House color={color} size={22} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: "Apps",
          tabBarIcon: ({ color, focused }) => (
            <Briefcase color={color} size={22} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="interviews"
        options={{
          title: "Interviews",
          tabBarIcon: ({ color, focused }) => (
            <CalendarBlank color={color} size={22} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="questions"
        options={{
          title: "Questions",
          tabBarIcon: ({ color, focused }) => (
            <Question color={color} size={22} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <User color={color} size={22} weight={focused ? "fill" : "regular"} />
          ),
        }}
      />
    </Tabs>
  );
}
