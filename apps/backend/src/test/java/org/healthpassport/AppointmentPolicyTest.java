package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;

import java.time.*;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AppointmentPolicyTest {
  private final Instant now = Instant.parse("2026-09-26T12:00:00Z");
  private final AppointmentPolicy policy = new AppointmentPolicy(Clock.fixed(now, ZoneOffset.UTC));

  @Test
  void bookingWindowIncludesBoundariesButRejectsTimesOutsideThem() {
    assertTrue(policy.withinBookingWindow(now.minusSeconds(300).toEpochMilli()));
    assertFalse(policy.withinBookingWindow(now.minusSeconds(300).toEpochMilli() - 1));
    assertTrue(policy.withinBookingWindow(now.plusSeconds(366L * 86400).toEpochMilli()));
    assertFalse(policy.withinBookingWindow(now.plusSeconds(366L * 86400).toEpochMilli() + 1));
  }

  @Test
  void terminalStatesCannotReopenAndTriageCanEnterConsultation() {
    for (String state : new String[] {"completed", "cancelled", "no_show"}) {
      assertTrue(policy.isClosed(state));
      assertTrue(policy.transitionsFrom(state).isEmpty());
    }
    assertFalse(policy.transitionsFrom("checked_in").contains("scheduled"));
    assertTrue(policy.transitionsFrom("triaged").contains("in_progress"));
  }

  @Test
  void soapNotesPreserveTextAndRejectMissingOrOversizedSections() {
    var values =
        Map.<String, Object>of(
            "subjective",
            "Reported history\nSecond line",
            "objective",
            "",
            "assessment",
            "Fictional assessment",
            "plan",
            "Fictional plan");
    var note = VisitNote.from(values);
    assertEquals(
        "Scheduled visit date: 2026-09-26T12:00:00Z\n\nSubjective\nReported history\nSecond line"
            + "\n\nObjective\n\n\nAssessment\nFictional assessment\n\nPlan\nFictional plan",
        note.formatEncounter(now));
    assertThrows(
        IllegalArgumentException.class, () -> VisitNote.from(Map.of("subjective", "only one")));
    assertThrows(IllegalArgumentException.class, () -> new VisitNote("a".repeat(2001), "", "", ""));
    assertDoesNotThrow(() -> new VisitNote("a".repeat(2000), "", "", ""));
  }
}
