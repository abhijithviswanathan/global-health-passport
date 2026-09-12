ALTER TABLE medical_document ADD COLUMN document_purpose VARCHAR(20) NOT NULL DEFAULT 'clinical';
UPDATE medical_document SET document_purpose='insurance' WHERE id IN (SELECT card_document_id FROM insurance_profile WHERE card_document_id IS NOT NULL);
CREATE INDEX document_purpose_owner ON medical_document(patient_id,document_purpose);
