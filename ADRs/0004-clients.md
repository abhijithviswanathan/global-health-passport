# ADR 0004: React web and React Native mobile

Status: Accepted for foundation.

## Decision
Use React/TypeScript web from the Sites vinext starter and React Native/Expo mobile. Share contracts and visual tokens where useful; use OS-specific security integrations. Flutter was considered but adds a separate language/toolchain without an identified benefit for this team.

## Consequences
Sites web hosting is distinct from Java backend hosting. Native security, passkeys, notifications and biometrics require device/build verification. Type safety is not proof of those behaviors.
