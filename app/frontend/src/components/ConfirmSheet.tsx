import React from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, spacing, radius, fontSize } from "../theme";

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} testID="confirm-backdrop">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.msg}>{message}</Text> : null}
          <Pressable style={styles.danger} onPress={onConfirm} testID="confirm-delete-button">
            <Text style={styles.dangerText}>{confirmLabel}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} testID="confirm-cancel-button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: c.onSurface },
  msg: { fontSize: fontSize.base, color: c.muted },
  danger: { backgroundColor: c.error, paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.sm },
  dangerText: { color: c.onError, fontWeight: "700", fontSize: fontSize.lg },
  cancel: { paddingVertical: spacing.lg, borderRadius: radius.pill, alignItems: "center", backgroundColor: c.surfaceTertiary },
  cancelText: { color: c.onSurface, fontWeight: "700", fontSize: fontSize.lg },
}));
