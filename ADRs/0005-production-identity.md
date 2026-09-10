# ADR 0005: Production identity integration

Status: Required; integration pending.

## Decision
Use a maintained OIDC provider supporting authorization code/PKCE, passkeys/MFA, secure recovery and session lifecycle. Synthetic local login supports development only. Do not implement a proprietary authentication imitation.

## Consequences
Selection depends on residency, contracts and deployment. Production cannot accept development shortcuts; verification, MFA and recovery tests block live data.
