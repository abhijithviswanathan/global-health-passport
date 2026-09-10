CREATE TABLE identity_mfa (user_id VARCHAR(36) PRIMARY KEY REFERENCES app_user(id), encrypted_secret VARCHAR(1000) NOT NULL, enabled BOOLEAN NOT NULL, last_step BIGINT NOT NULL, created_at VARCHAR(40) NOT NULL);
CREATE TABLE recovery_code (code_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES app_user(id));
CREATE INDEX recovery_user ON recovery_code(user_id);
CREATE TABLE identity_session (id VARCHAR(36) PRIMARY KEY, session_hash VARCHAR(64) UNIQUE NOT NULL, user_id VARCHAR(36) NOT NULL REFERENCES app_user(id), created_at VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL, revoked BOOLEAN NOT NULL, device_label VARCHAR(200) NOT NULL);
CREATE INDEX identity_session_user ON identity_session(user_id);
