package org.healthpassport;

import static org.healthpassport.PassportApi.error;

import java.time.Instant;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Shared scheduling service used by clinician, reception and public-slot workflows. */
@Service
class AppointmentScheduler {
  private final PassportApi api;
  private final AppointmentRepository appointments;
  private final AppointmentPolicy policy;

  AppointmentScheduler(
      PassportApi api, AppointmentRepository appointments, AppointmentPolicy policy) {
    this.api = api;
    this.appointments = appointments;
    this.policy = policy;
  }

  // Caller must hold a transaction; PostgreSQL and H2 then serialize checks for this doctor.
  void lockDoctor(Map<String, Object> doctor) {
    appointments.lockDoctor(api.uid(doctor));
  }

  long timestamp(Map<String, Object> input) {
    try {
      return Instant.parse(api.field(input, "startsAt", 40)).toEpochMilli();
    } catch (Exception invalid) {
      throw error(400, "Choose a valid appointment time");
    }
  }

  void slot(Map<String, Object> doctor, long start, int duration, String exceptId) {
    api.tenants.available(doctor, Instant.ofEpochMilli(start), duration, exceptId);
    if (!policy.withinBookingWindow(start))
      throw error(400, "Choose a time from now to one year ahead");
    if (appointments.overlaps(api.uid(doctor), start, start + duration * 60000L, exceptId))
      throw error(409, "This time overlaps another appointment. Choose a different time.");
  }
}
