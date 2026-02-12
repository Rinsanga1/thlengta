# Thlengta – Staging Environment Manual

This document explains how to set up and use a **staging environment** for Thlengta.
Staging is a safe, production-like environment used to test changes before deploying to live users.

---

## 1. What Is Staging?

Staging is:
- A copy of production running separately
- Used for testing new features, UI, and fixes
- Invisible to real users

For Thlengta, staging runs:
- On the **same VPS**
- On a **different port**
- With a **separate database**
- Behind a **subdomain** (e.g. `staging.thlengta.com`)

---

## 2. Why Staging Is Important

- No risk to real attendance data
- No broken QR codes for live stores
- Confident testing before production deploy
- Same code, same behavior, safer place

---

## 3. Architecture Overview

```
Production:
  Domain: thlengta.com
  Port:   8105
  DB:     data.sqlite
  PM2:    thlengta

Staging:
  Domain: staging.thlengta.com
  Port:   8106
  DB:     data_staging.sqlite
  PM2:    thlengta-staging
```

---

## 4. Folder Structure

On the VPS:

```
/home/enfuego_r/
├─ thlengta/               (production)
│  └─ data.sqlite
│
├─ thlengta-staging/       (staging)
│  └─ data_staging.sqlite
```

Staging is a **separate git clone**, not a branch checkout.

---

## 5. Create Staging Folder

```bash
cd /home/enfuego_r
git clone https://github.com/enfuego-r/thlengta.git thlengta-staging
cd thlengta-staging
npm install
```

---

## 6. Staging Environment Variables

Create `.env` inside `thlengta-staging`:

```env
PORT=8106
NODE_ENV=staging
SESSION_SECRET=staging_secret_change_me

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Thleng Ta! Staging <staging@thlengta.com>"
SUPERADMIN_EMAIL=staging@thlengta.com
```

---

## 7. Staging Database

Create a separate DB file:

```bash
touch data_staging.sqlite
```

Optional:
- Copy production DB once for realistic testing
```bash
cp ../thlengta/data.sqlite data_staging.sqlite
```

Never copy staging DB back to production.

---

## 8. Create Staging Superadmin

Run once:

```bash
node create_superadmin.js
```

This creates a staging-only admin.

---

## 9. Run Staging with PM2

```bash
pm2 start npm --name thlengta-staging -- run dev
pm2 save
```

Check:
```bash
pm2 list
```

---

## 10. Nginx Subdomain Setup

Create config:

```bash
sudo nano /etc/nginx/sites-available/staging.thlengta.com
```

Example:

```nginx
server {
    server_name staging.thlengta.com;

    location / {
        proxy_pass http://127.0.0.1:8106;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/staging.thlengta.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 11. HTTPS (Optional but Recommended)

```bash
sudo certbot --nginx -d staging.thlengta.com
```

---

## 12. Deployment Workflow

1. Test locally
2. Push to GitHub
3. Pull into staging
4. Test on staging.thlengta.com
5. Pull into production

---

## 13. Updating Staging

```bash
cd ~/thlengta-staging
git pull
npm install
pm2 restart thlengta-staging
```

---

## 14. Safety Rules

- Never use production DB in staging long-term
- Never expose staging URL publicly
- Never share staging credentials

---

## 15. Quick Setup Summary

```bash
git clone https://github.com/enfuego-r/thlengta.git thlengta-staging
cd thlengta-staging
npm install
touch data_staging.sqlite
nano .env
node create_superadmin.js
pm2 start npm --name thlengta-staging -- run dev
```

---

**End of document**
