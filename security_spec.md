# Security Specification - Kapten/Lycel WiFi Promo Registration

## Data Invariants
1. A user's profile under `/users/{userId}` must only be read and created by the authenticated owner (`userId == request.auth.uid`).
2. The user's profile document is immutable after creation (particularly the assigned `voucher`, `email`, `uid`, and `createdAt` parameters). Direct client-side updates are forbidden.
3. Promo vouchers in `/promo_vouchers/{voucherCode}` cannot be directly modified or deleted by the user. Assigning of vouchers is atomic and managed on registration/first-login via transactions, but protected by rules that prevent users from changing fields like `duration` or assigning vouchers to other users.
4. Users can read public voucher info if it matches their assigned voucher, or they can only read `/users/{userId}` and we can query the specific `/promo_vouchers/{voucherCode}` they are assigned, restricting general read operations on `/promo_vouchers`.

---

## The "Dirty Dozen" Malicious Payloads

### Payload 1: Identity Spoofing (Creating a profile for another UID)
*   **Path:** `/users/malicious_uid_123`
*   **Auth UID:** `legitimate_uid_456`
*   **Payload:** `{ "uid": "legitimate_uid_456", "email": "victim@gmail.com", "voucher": "FREE001" }`
*   **Expected Behavior:** `PERMISSION_DENIED`

### Payload 2: Self-Assigned/Stolen Vouchers (Client-side allocation bypass)
*   **Path:** `/users/legitimate_uid_456`
*   **Auth UID:** `legitimate_uid_456`
*   **Payload:** `{ "uid": "legitimate_uid_456", "email": "mine@gmail.com", "voucher": "ADMIN_VOUCHER_XYZ" }` (without transaction check)
*   **Expected Behavior:** `PERMISSION_DENIED` (if not validating valid voucher exists or bypassing database consistency rules).

### Payload 3: Direct User Profile Modification (Value Tampering)
*   **Path:** `/users/legitimate_uid_456`
*   **Auth UID:** `legitimate_uid_456`
*   **Action:** `update`
*   **Payload:** `{ "voucher": "FREE009_MODIFIED" }`
*   **Expected Behavior:** `PERMISSION_DENIED` (User profiles must be immutable).

### Payload 4: Overwriting existing promo vouchers directly via the client
*   **Path:** `/promo_vouchers/FREE001`
*   **Auth UID:** `legitimate_uid_456`
*   **Action:** `write`
*   **Payload:** `{ "code": "FREE001", "duration": "999 Hours", "used": false, "usedBy": "" }`
*   **Expected Behavior:** `PERMISSION_DENIED` (Normal users cannot write to the master promo collection).

### Payload 5: Shell-Injecting / ID Poisoning on User Document ID
*   **Path:** `/users/` + `A_SUPER_LONG_1024_CHAR_JUNK_INJECTION`
*   **Auth UID:** `A_SUPER_LONG_1024_CHAR_JUNK_INJECTION`
*   **Expected Behavior:** `PERMISSION_DENIED` (Enforce ID size and regex checks).

### Payload 6: Blanket User Profile Reading (Data Harvester)
*   **Path:** `/users`
*   **Auth UID:** `legitimate_uid_456`
*   **Action:** `list` / `query` (without filtering by individual uid)
*   **Expected Behavior:** `PERMISSION_DENIED`

### Payload 7: Timestamp Spoofing (Pre-dating profile creation)
*   **Path:** `/users/legitimate_uid_456`
*   **Auth UID:** `legitimate_uid_456`
*   **Payload:** `{ "uid": "legitimate_uid_456", "email": "user@gmail.com", "voucher": "FREE001", "createdAt": "2020-01-01T00:00:00Z" }` (malicious historical date)
*   **Expected Behavior:** `PERMISSION_DENIED` (Must match `request.time`).

### Payload 8: Hijacking another user's assigned voucher
*   **Path:** `/promo_vouchers/FREE001`
*   **Auth UID:** `attacker_uid_789`
*   **Action:** `update`
*   **Payload:** `{ "used": true, "usedBy": "attacker@gmail.com" }`
*   **Expected Behavior:** `PERMISSION_DENIED` (Normal users cannot write to promo_vouchers).

### Payload 9: Blanket Reading of Unassigned Vouchers
*   **Path:** `/promo_vouchers`
*   **Auth UID:** `legitimate_uid_456`
*   **Action:** `list`/`query` (Harvesting unused codes to redeem outside the system)
*   **Expected Behavior:** `PERMISSION_DENIED` (Only individual gets are allowed if they are the verified assigned user, or list is fully blocked for users).

### Payload 10: Email Spoofing
*   **Path:** `/users/legitimate_uid_456`
*   **Auth UID:** `legitimate_uid_456` (Email: `attacker@gmail.com`)
*   **Payload:** `{ "uid": "legitimate_uid_456", "email": "admin@lycelwifi.com", "voucher": "FREE001" }`
*   **Expected Behavior:** `PERMISSION_DENIED`

### Payload 11: Deleting critical user profile
*   **Path:** `/users/legitimate_uid_456`
*   **Auth UID:** `legitimate_uid_456`
*   **Action:** `delete`
*   **Expected Behavior:** `PERMISSION_DENIED` (Users cannot delete progress logs once established).

### Payload 12: Creating an unauthorized free voucher list
*   **Path:** `/promo_vouchers/ANOTHER_FREE_CODE`
*   **Auth UID:** `legitimate_uid_456`
*   **Action:** `create`
*   **Expected Behavior:** `PERMISSION_DENIED`
