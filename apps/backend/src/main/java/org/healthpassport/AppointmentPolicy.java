package org.healthpassport;

import java.time.Clock;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Pure scheduling rules, with an injectable clock for deterministic boundary tests. */
@Component
class AppointmentPolicy {
  private static final Set<String> CLOSED = Set.of("completed", "cancelled", "no_show");
  private final Clock clock;

  AppointmentPolicy() {
    this(Clock.systemUTC());
  }

  AppointmentPolicy(Clock clock) {
    this.clock = clock;
  }

  boolean isClosed(String status) {
    return CLOSED.contains(status);
  }

  boolean withinBookingWindow(long start) {
    var now = clock.instant();
    return start >= now.minusSeconds(300).toEpochMilli()
        && start <= now.plusSeconds(366L * 86400).toEpochMilli();
  }

  Set<String> transitionsFrom(String status) {
    if (isClosed(status)) return Set.of();
    return switch (status) {
      case "scheduled" -> Set.of("scheduled", "checked_in", "in_progress", "cancelled", "no_show");
      case "checked_in" -> Set.of("checked_in", "in_progress", "cancelled");
      // Care-team states such as triaged may advance to the consultation or cancellation.
      default -> Set.of("in_progress", "cancelled");
    };
  }
}
