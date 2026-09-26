/** Stateless patient components. Permission, session and background state belong to App. */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { provenanceLines } from "../../../shared/care-model";
import type { Entry } from "../api";
import { formatDate, type PatientColors } from "./theme";
import { patientStyles as styles } from "./styles";

type ThemeProps = { colors: PatientColors };
export function PatientButton({
  label,
  onPress,
  secondary = false,
  busy = false,
  colors,
}: ThemeProps & {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.card : colors.button,
          borderColor: colors.line,
          opacity: busy || pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text
        style={[styles.buttonText, { color: secondary ? colors.ink : "#fff" }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PatientText({
  text,
  muted = false,
  colors,
}: ThemeProps & { text: string; muted?: boolean }) {
  return (
    <Text style={[styles.copy, { color: muted ? colors.muted : colors.ink }]}>
      {text}
    </Text>
  );
}

export function PatientCard({
  title,
  children,
  colors,
}: ThemeProps & { title: string; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[styles.cardTitle, { color: colors.ink }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function PatientRecordCard({
  record,
  colors,
}: ThemeProps & { record: Entry }) {
  // The shared provenance formatter consumes server keys; legacy patient rows are camelCase.
  const provenance = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase()),
      value,
    ]),
  );
  return (
    <PatientCard title={record.title} colors={colors}>
      <PatientText
        text={`${record.kind.toLowerCase().replaceAll("_", " ")} · record ${record.status}`}
        muted
        colors={colors}
      />
      <PatientText text={record.details} colors={colors} />
      <PatientText
        text={`${record.source} · ${formatDate(record.createdAt)}`}
        muted
        colors={colors}
      />
      {record.clinicalStatus && (
        <PatientText
          text={`Clinical status: ${record.clinicalStatus}`}
          muted
          colors={colors}
        />
      )}
      {provenanceLines(provenance).map((line, index) => (
        <Text key={index} style={{ fontSize: 12, color: colors.muted }}>
          {line}
        </Text>
      ))}
    </PatientCard>
  );
}
