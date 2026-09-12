CREATE TABLE profile_policy (
 owner_id VARCHAR(36) PRIMARY KEY REFERENCES app_user(id),
 visibility VARCHAR(20) NOT NULL DEFAULT 'none',
 updated_at VARCHAR(40) NOT NULL
);
CREATE TABLE profile_viewer (
 owner_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 viewer_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 PRIMARY KEY(owner_id,viewer_id)
);
CREATE TABLE photo_asset (
 id VARCHAR(36) PRIMARY KEY,
 owner_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 author_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 kind VARCHAR(20) NOT NULL,
 holder_key VARCHAR(320) NOT NULL,
 holder_scope VARCHAR(20) NOT NULL,
 organization VARCHAR(160) NOT NULL,
 purpose VARCHAR(200) NOT NULL,
 created_at VARCHAR(40) NOT NULL,
 UNIQUE(owner_id,kind,holder_key)
);
