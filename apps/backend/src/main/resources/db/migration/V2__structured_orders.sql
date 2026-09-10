ALTER TABLE clinical_record ADD COLUMN recipient_id VARCHAR(36) REFERENCES app_user(id);
ALTER TABLE clinical_record ADD COLUMN quantity INTEGER;
ALTER TABLE clinical_record ADD COLUMN refills INTEGER;
ALTER TABLE clinical_record ADD COLUMN dosage VARCHAR(100);
ALTER TABLE clinical_record ADD COLUMN route VARCHAR(100);
ALTER TABLE clinical_record ADD COLUMN frequency VARCHAR(100);
ALTER TABLE clinical_record ADD COLUMN duration VARCHAR(100);
ALTER TABLE clinical_record ADD COLUMN idempotency_key VARCHAR(100);
CREATE UNIQUE INDEX dispense_idempotency ON clinical_record(author_id,idempotency_key);
