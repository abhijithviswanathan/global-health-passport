/** Native patient colors and display-only date formatting; no storage or clinical rules. */
export function patientColors(dark: boolean) {
  return dark
    ? {
        bg: "#111c20",
        card: "#1b2b30",
        ink: "#f0f5f2",
        muted: "#b0c5c4",
        line: "#3a5054",
        accent: "#7fd4bf",
        button: "#276b5f",
      }
    : {
        bg: "#f4f6f2",
        card: "#ffffff",
        ink: "#153d39",
        muted: "#58706b",
        line: "#dce5df",
        accent: "#236958",
        button: "#236958",
      };
}
export type PatientColors = ReturnType<typeof patientColors>;
export const formatDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
};
