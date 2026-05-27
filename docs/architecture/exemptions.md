# Architecture Exemptions

Exemptions are temporary. They exist so the rebuild can be incremental without
pretending current debt is acceptable.

## Required Format

```txt
File:
Owner:
Rule Exempted:
Reason:
Split or Fix Plan:
Expires:
```

## Backend Exemptions

```txt
None active. Backend hard-limit files must fail the quality gate instead of
being exempted.
```

## Frontend Exemptions

```txt
File: src/components/ui/sidebar.tsx
Owner: frontend/ui
Rule Exempted: TS/TSX hard file-size limit
Reason: Generated UI primitive has many variants and subcomponents.
Split or Fix Plan: Keep as a generated primitive only. Do not add app behavior here; wrap it from feature code instead.
Expires: Generated UI primitive review
```
