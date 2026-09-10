# Troubleshooting

| Symptom | Check and action |
|---|---|
| Java build will not start | Confirm Java 21 and Maven availability; use the version specified by the backend project |
| Dependency install fails | Check network availability and lockfile/runtime compatibility; retain error output and do not claim a build pass |
| Port already in use | Identify the local service before stopping it; change documented port and matching client API address |
| Backend data disappears | H2 test databases may be ephemeral; use the documented local file configuration for persistent synthetic development |
| Migration checksum mismatch | Do not edit applied migrations; restore a clean disposable synthetic DB or add an appropriate forward migration |
| Browser shows sample records while API is down | Check whether synthetic mode is enabled; sample screens do not establish backend connectivity |
| Browser cannot call backend | Verify API origin/proxy, cookie transport, origin/CSRF policy and backend binding; never solve by wildcard credentials |
| Forbidden clinical record | Inspect actor role, patient ownership, grant status/category/purpose and expiry; do not bypass policy in the UI |
| Mobile device cannot reach localhost | A physical device's localhost is itself; use the documented reachable development address and approved network configuration |
| Biometric or notification feature unavailable | Native runtime/device permissions and builds may be required; web/Expo preview does not verify secure native behavior |
| Audit integrity discrepancy | Preserve data and investigate; do not rewrite events to hide the failure |

Use synthetic reproduction steps and correlation IDs for issue reports. Do not attach real patient documents, tokens, passwords or full sensitive logs.
