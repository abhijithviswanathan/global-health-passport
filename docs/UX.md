# UX specification and design system

## Information architecture
Patient: Overview, Timeline, Records, Medication Passport, Sharing, Access History and Account Security. Clinician: Access Requests, Authorized Patients, Patient Context, Encounters, Prescriptions and Orders. Laboratory: Assigned Orders and Result Entry. Pharmacy: Prescription Verification and Dispensing History. Organization administration: Members and Organization Settings. Security/compliance views are separate and must not imply clinical access.

## Clinical interaction rules
Keep patient identity/context visible during writes. Before commit, display intended patient, record type and critical fields. Show source, author, date and verification state alongside clinical information. Distinguish unknown and none. Restriction banners communicate incomplete scope without exposing hidden categories. Destructive consent changes explain that future sharing stops while past disclosure remains. Submission controls prevent accidental repeat writes and display actionable validation.

## Visual tokens and behavior
Use neutral light backgrounds and deep-charcoal dark backgrounds, restrained teal emphasis, approximately 8px card radii, consistent 4/8px spacing increments, readable body type and modest elevation. Status always has text or an icon label in addition to color. Use system theme plus persistent manual preference. Respect reduced motion. Screen layouts reflow from sidebar/multicolumn desktop to drawer/navigation and single-column forms on small devices. Tables become labelled cards or explicitly scrollable regions with context retained.

## Accessibility acceptance
Target WCAG 2.2 AA. Every action has a programmatic name; form errors identify field and correction; headings/landmarks follow reading order; visible keyboard focus is retained after route/modal changes. Live result/status announcements avoid duplicate speech. Test 320px and 2560px widths, 200% zoom, keyboard-only navigation, both themes, reduced motion and native font scaling. Automated accessibility results do not replace manual screen-reader and clinical usability review. Loading, empty, denied, offline and server-error states need distinct meaningful messages.
