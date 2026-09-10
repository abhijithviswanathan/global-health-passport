CREATE TABLE medical_document (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
  author_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
  filename VARCHAR(160) NOT NULL,
  media_type VARCHAR(80) NOT NULL,
  size_bytes BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  source VARCHAR(200) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL
);
CREATE INDEX document_patient ON medical_document(patient_id,created_at);
