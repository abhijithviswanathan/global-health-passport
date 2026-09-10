-- Clinical state is distinct from the record's amendment/lifecycle state.
-- Existing records remain unknown; no historical status is inferred.
ALTER TABLE clinical_record ADD COLUMN clinical_status VARCHAR(30);
