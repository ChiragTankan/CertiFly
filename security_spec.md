# Security Specification & Threat Model

This document specifies the data invariants, threat vectors, and verification payloads used to secure the Firebase Firestore configuration.

## 1. Data Invariants
- **User Ownership**: Campaigns can only be read, created, updated, or deleted by their original creator (`createdBy == request.auth.uid`).
- **Relational Integrity**: Recipients can only be queried, created, or managed if the parent Campaign belongs to the authenticated user.
- **Terminal State Locking**: Once a campaign's `status` becomes `completed` or `failed`, non-admin users cannot make any further modifications.
- **Strict Keys**: Documents cannot contain unsolicited ("Glow Fields" or "Ghost Fields") to prevent privilege escalation.
- **Timestamp Integrity**: `createdAt` and `updatedAt` properties must correspond exactly to `request.time`.

## 2. The "Dirty Dozen" Threat Payloads

| Payload ID | Target Collection | Threat Description | Attack Payload | Expected Result |
|---|---|---|---|---|
| D1 | campaigns | Create campaign with spoofed `createdBy` | `{ createdBy: "another_user_uid", name: "Campaign", ... }` | PERMISSION_DENIED |
| D2 | campaigns | Read campaign belonging to another user | Access path `campaigns/other_user_camp_id` as regular user | PERMISSION_DENIED |
| D3 | campaigns | Empty write / Missing required fields | `{ name: "Campaign" }` (omitting subject, body, status) | PERMISSION_DENIED |
| D4 | campaigns | Unsolicited key injection (Ghost field) | `{ name: "Campaign", sysAdminRole: true, ... }` | PERMISSION_DENIED |
| D5 | campaigns | Update campaign to invalid status | `{ status: "infinite_sending_loop" }` | PERMISSION_DENIED |
| D6 | campaigns | Mutate immutable `createdAt` | `{ createdAt: "2010-01-01T00:00:00Z" }` | PERMISSION_DENIED |
| D7 | campaigns/recipients | Write recipient in sibling/foreign campaign | Write to `/campaigns/other_user_camp/recipients/some_id` | PERMISSION_DENIED |
| D8 | campaigns/recipients | Spoof recipient status field directly | Attempt to change recipient status to `sent` | PERMISSION_DENIED |
| D9 | campaigns | Update fields in finished campaign | Attempt to update `name` when status is `completed` | PERMISSION_DENIED |
| D10 | campaigns | ID Poisoning Guard | Access path `campaigns/LONG_1024_BYTE_JUNK_STRING` | PERMISSION_DENIED |
| D11 | campaigns | Inject client-side timestamp | `{ createdAt: "2026-06-13T00:00:00Z" }` (not server-timestamp) | PERMISSION_DENIED |
| D12 | campaigns/recipients | Blanket listing of recipients without campaign boundary | Unrestricted database query | PERMISSION_DENIED |

## 3. Test Invariant Runner
A test suite would assert these permission constraints:
```typescript
// firestore.rules.test.ts
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
// Assert security rules reject each of the "Dirty Dozen" payloads above.
```
