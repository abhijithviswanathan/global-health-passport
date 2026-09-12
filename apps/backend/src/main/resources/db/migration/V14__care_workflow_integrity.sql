CREATE TABLE clinic_freshness(organization VARCHAR(100) NOT NULL, clinic VARCHAR(100) NOT NULL, kind VARCHAR(40) NOT NULL, minutes INTEGER NOT NULL CHECK(minutes>0), version INTEGER NOT NULL, updated_by VARCHAR(36) NOT NULL REFERENCES app_user(id), updated_at VARCHAR(40) NOT NULL, PRIMARY KEY(organization,clinic,kind));
ALTER TABLE care_conversation ADD COLUMN request_key VARCHAR(100);
CREATE UNIQUE INDEX conversation_submission ON care_conversation(creator_id,request_key);
ALTER TABLE medical_document ADD COLUMN provenance_record_id VARCHAR(36) REFERENCES clinical_record(id);
ALTER TABLE clinical_record ADD COLUMN measurements TEXT;
