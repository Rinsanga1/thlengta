# Employee Registration & Check-In Flow

## Overview

This document describes the new employee registration and check-in system.

**Core Principles:**
- Any user can be an employee at any workplace (owner, manager, or regular user)
- Device registration via QR scan (no PIN required)
- Single QR code handles both registration and check-in

---

## 1. Employee Check-In Flow

### User Experience

1. User clicks "Check In" in the header navigation
2. Page opens phone camera to scan QR code
3. System determines state:

| State | Outcome |
|-------|---------|
| User NOT logged in | Redirect to login → then back to QR |
| User logged in + NOT employee of this workplace | Show error: "You are not an employee of this store. Ask the owner to register you." |
| User logged in + IS employee | Show confirmation dialog |
| User logged in + pending invite (email matches) | Show "Join [Store]?" confirm button |

4. User confirms → check-in recorded with GPS location

### Navigation

- "Check In" link in header (visible when logged in)
- Links to `/e/checkin` page

---

## 2. Owner Adding Employee Flow

### User Experience

1. Owner goes to workplace dashboard → Employee tab
2. Clicks "Register Employee" → popup modal
3. Modal contains:
   - QR code for the store (auto-generated, same as existing QR)
   - Email input field (owner's employee's email)
4. Owner enters employee's email and submits
5. Creates a pending registration for that workplace + email

### Employee Registration (Scanning QR)

1. Employee logs into the app (any user account)
2. Employee scans the store QR code
3. System checks:
   - Is user already an employee of this workplace?
     - Yes → Show check-in confirmation
     - No → Is there a pending invite with matching email?
       - Yes → Show "Join [Store]?" confirm button
       - No → Show error: "You are not registered. Ask the owner to register you."

4. Employee confirms → device registered → success message
5. Employee can now check in to that store

---

## 3. QR Code Behavior

Single QR code (`/e/scan/:publicId`) handles multiple states:

```
GET /e/scan/:publicId
  ├─ If user NOT logged in
  │   └─ Redirect to /users/signin?redirect=/e/scan/:publicId
  │
  ├─ If user IS logged in AND is employee
  │   └─ Show "Check In?" button
  │
  ├─ If user IS logged in AND has pending invite (email matches)
  │   └─ Show "Join [Store]?" confirm button
  │
  └─ If user IS logged in AND no relationship
      └─ Show error: "Not registered"
```

---

## 4. Check-In Page (`/e/checkin`)

**Purpose:** Central hub for employees to check in

**Features:**
- QR scanner button (opens camera)
- List of workplaces where user is registered as employee
- Quick check-in from list

---

## 5. Device Management

### Registration
- Device automatically registered when employee accepts invite
- Uses existing device token + fingerprint system
- One device per employee

### Re-registration (new device)
- Employee scans QR → system detects existing employee record
- Old employee record deleted → new registration with new device
- This handles device change scenarios

### Owner Actions
- View which employees have devices registered
- No manual reset needed (re-scan QR handles it)

---

## 6. Database Changes

### employees table modifications

| Column | Change |
|--------|--------|
| `user_id` | ADD - FK to users.id (optional, for faster lookups) |
| `pin_hash` | REMOVE - no longer needed |
| `registered_at` | ADD - when employee accepted invite |
| `name` | KEEP - employee's display name |
| `email` | KEEP - user's email |
| `is_active` | KEEP - owner can disable |

---

## 7. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/e/checkin` | GET | Check-in page with QR scanner + workplace list |
| `/e/scan/:publicId` | GET | QR scan landing page |
| `/e/scan/:publicId` | POST | Handle check-in or registration |
| `/owner/workplaces/:workplaceId/employees/invite` | POST | Owner creates pending invite |

---

## 8. Edge Cases

| Scenario | Handling |
|----------|----------|
| Owner registers themselves as employee | Allowed |
| Owner registers manager as employee | Allowed |
| User scans QR but not logged in | Redirect to login, then back |
| User scans QR but email doesn't match | Show error message |
| Employee re-scans QR (already registered) | Show "Already registered" |
| Owner enters wrong email | Employee sees error when scanning, owner can retry |
| Owner deletes employee | Employee loses access immediately |
| Employee declines invite | Not shown as pending (can re-scan) |

---

## 9. Removed Features

- PIN-based authentication for employees (no longer needed)
- Manual device reset (re-scan QR handles this)
