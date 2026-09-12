CREATE TABLE appointment (
 id VARCHAR(36) PRIMARY KEY,
 doctor_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 patient_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 starts_at BIGINT NOT NULL,
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 180),
 reason VARCHAR(200) NOT NULL,
 visit_mode VARCHAR(20) NOT NULL,
 status VARCHAR(20) NOT NULL,
 version INTEGER NOT NULL DEFAULT 0,
 request_key VARCHAR(80) NOT NULL,
 created_at VARCHAR(40) NOT NULL,
 updated_at VARCHAR(40) NOT NULL,
 completed_record_id VARCHAR(36) REFERENCES clinical_record(id),
 UNIQUE(doctor_id, request_key)
);
CREATE INDEX appointment_schedule ON appointment(doctor_id, starts_at);
CREATE TABLE visit_draft (
 appointment_id VARCHAR(36) PRIMARY KEY REFERENCES appointment(id),
 subjective TEXT NOT NULL,
 objective TEXT NOT NULL,
 assessment TEXT NOT NULL,
 plan TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0,
 updated_at VARCHAR(40) NOT NULL
);
