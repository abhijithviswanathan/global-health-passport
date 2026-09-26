/** Role-to-workspace presentation only; the server remains responsible for authorization. */
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Clock3,
  Pill,
  FlaskConical,
  FileText,
  Activity,
  Settings2,
  Search,
} from "lucide-react";
import type { ClinicianView } from "@/components/clinician-workspace";
import type { User } from "@/lib/api";

export type View =
  | ClinicianView
  | "care"
  | "hospital"
  | "overview"
  | "timeline"
  | "medications"
  | "documents"
  | "sharing"
  | "activity"
  | "security"
  | "labs"
  | "learning"
  | "organization"
  | "profile";

export const titles: Record<View, string> = {
  hospital: "Hospital workspace",
  care: "Care team",
  profile: "Profile",
  today: "Today",
  patients: "Patients",
  appointments: "Appointments",
  overview: "Your health, in perspective",
  timeline: "Medical timeline",
  medications: "Medication Passport",
  documents: "Clinical documents",
  sharing: "Sharing & permissions",
  activity: "Access history",
  security: "Account security",
  labs: "Laboratory & imaging",
  learning: "Clinical learning",
  organization: "Organization administration",
};

export const nav = [
  { id: "hospital", label: "Hospital workspace", icon: LayoutDashboard },
  { id: "care", label: "Care team", icon: Users },
  { id: "today", label: "Today", icon: LayoutDashboard },
  { id: "patients", label: "Patients", icon: Users },
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "timeline", label: "Medical timeline", icon: Clock3 },
  { id: "medications", label: "Medication Passport", icon: Pill },
  { id: "labs", label: "Labs & imaging", icon: FlaskConical },
  { id: "documents", label: "Clinical documents", icon: FileText },
  { id: "sharing", label: "Sharing & permissions", icon: Users },
  { id: "activity", label: "Access history", icon: Activity },
  { id: "security", label: "Account security", icon: Settings2 },
  { id: "learning", label: "Clinical learning", icon: Search },
  { id: "organization", label: "Organization", icon: Users },
] as const;

export function homeView(u: User): View {
  if (["billing", "insurer", "security"].includes(u.role)) return "hospital";
  if (
    [
      "nurse",
      "reception",
      "diagnostic",
      "coordinator",
      "admin",
      "lab",
      "pharmacy",
    ].includes(u.role)
  )
    return "care";
  return u.role === "doctor"
    ? "today"
    : ["admin", "security"].includes(u.role)
      ? "activity"
      : "overview";
}
