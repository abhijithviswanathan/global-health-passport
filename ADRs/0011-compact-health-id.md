# ADR 0011: Compact permanent Health IDs

Accepted following the user’s request for a short passport-style identifier.

Use exactly **9 uppercase letters and digits**, such as `K7M4RT9WX`. The 32-character alphabet excludes `I`, `O`, `0` and `1`, giving 45 random bits and about 35 trillion possible values. Generate with SecureRandom; enforce database uniqueness and retry registration collisions in fresh transactions. The ID is a public label and is never accepted as an authentication or authorization secret. Resource UUIDs, internal database keys, consent checks, session credentials and QR tokens remain independent.

Migration V9 adds a historical alias table. V10 assigns short IDs to existing long-ID accounts and retains the normalized historical IDs as aliases. Patient UUIDs, clinical records, grants and audit history are not rewritten. Future migrations and restarts do not reissue compact IDs. Provider lookup accepts upper/lower case and optional spaces/hyphens; the displayed canonical ID stays nine characters.

This supersedes ADR 0002’s 128-bit public-label length requirement. It deliberately prioritizes memorability while retaining uniqueness enforcement and authorization independently of identifier secrecy.
