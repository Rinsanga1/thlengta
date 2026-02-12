# Thlengta – Local Testing Manual

This document explains how to download Thlengta from GitHub and run it locally for testing and development, without affecting production users.

---

## 1. Purpose of Local Testing

Local testing is used to:
- Safely test new features (QR frames, UI, routes, logic)
- Debug without touching production
- Experiment freely without breaking live users

Local setup is simpler than production and intentionally avoids PM2, Nginx, and real emails.

---

## 2. Prerequisites (Install Once)

### Required
- Node.js (v18 LTS or v20 LTS recommended)
- npm (comes with Node)
- Git
- VS Code (recommended)

Check versions:
```bash
node -v
npm -v
git --version
```

### Not Required Locally
- PM2
- Nginx
- HTTPS
- SMTP credentials
- GPS APIs
- Razorpay

---

## 3. Clone the Repository

```bash
git clone https://github.com/enfuego-r/thlengta.git
cd thlengta
```

---

## 4. Install Dependencies

```bash
npm install
```

---

## 5. Environment Variables (.env)

Create a local-only .env file:

```env
PORT=8105
NODE_ENV=development
SESSION_SECRET=dev_secret_local

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Thleng Ta! <dev@localhost>"
SUPERADMIN_EMAIL=dev@localhost
```

---

## 6. Database (SQLite)

Create local database file:

```bash
touch data.sqlite
```

---

## 7. Create Superadmin

Run once on fresh DB:

```bash
node create_superadmin.js
```

---

## 8. Start the App

```bash
npm run dev
```

Open:
http://localhost:8105

---

## 9. What Works Locally

- Admin dashboard
- Store management
- Employees
- QR generation
- Framed QR download
- Attendance logs

---

## 10. What Does Not Work Locally

- Email sending
- HTTPS
- PM2
- Nginx routing

---

## 11. Reset Local Environment

```bash
rm data.sqlite
node create_superadmin.js
npm run dev
```

---

## 12. Git Safety

Never commit:
- data.sqlite
- .env
- backups

---

## 13. Quick Start

```bash
git clone https://github.com/enfuego-r/thlengta.git
cd thlengta
npm install
touch data.sqlite
nano .env
node create_superadmin.js
npm run dev
```
