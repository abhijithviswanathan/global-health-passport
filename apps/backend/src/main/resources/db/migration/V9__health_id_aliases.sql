CREATE TABLE health_id_alias (
  alias VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES app_user(id)
);
CREATE INDEX health_id_alias_user_idx ON health_id_alias(user_id);
