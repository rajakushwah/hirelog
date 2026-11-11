import React from "react";
import { Text, Pressable, ScrollView } from "react-native";
import { makeStyles, spacing, radius, fontSize, useTheme } from "../theme";

type Props<T extends string> = {
  options: readonly T[];
  testID?: string;
} & (
  | { multi?: false; value: T; onChange: (v: T) => void }
  | { multi: true; value: T[]; onChange: (v: T[]) => void }
);

export function ChipRow<T extends string>(props: Props<T>) {
  const { options, testID } = props;
  const styles = useStyles();
  const { colors } = useTheme();
  const isSelected = (opt: T) => (props.multi ? props.value.includes(opt) : props.value === opt);
  const toggle = (opt: T) => {
    if (props.multi) {
      const next = props.value.includes(opt) ? props.value.filter((v) => v !== opt) : [...props.value, opt];
      props.onChange(next);
    } else {
      props.onChange(opt);
    }
  };
  const prefix = testID ?? "chip";
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.outer}
      testID={testID}
    >
      {options.map((opt) => {
        const selected = isSelected(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => toggle(opt)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.brandPrimary : colors.surfaceTertiary,
                borderColor: selected ? colors.brandPrimary : colors.border,
              },
            ]}
            testID={`${prefix}-${opt}`}
          >
            <Text
              style={{
                color: selected ? colors.onBrandPrimary : colors.onSurfaceTertiary,
                fontWeight: "600",
                fontSize: fontSize.sm,
              }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  outer: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
}));
