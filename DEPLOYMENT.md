# 🚀 OMCS Deployment Guide — Put It Online

This guide covers **3 deployment options** from simplest to most production-ready.

---

## 📋 What You're Deploying

| Service | Technology | Port |
|---------|-----------|------|
| **Database** | PostgreSQL 16 | 5432 |
| **Backend API** | NestJS (Node.js) | 4000 |
| **Admin Dashboard** | Next.js 14 | 4001 |
| **Customer Storefront** | Next.js 16 | 4002 |
| **Reverse Proxy** | Nginx | 80/443 |

---

## Option A: VPS with Docker (Recommended) 🏆

**Best for**: Full control, Libyan market, cheapest long-term.  
**Cost**: $5-10/month (DigitalOcean, Hetzner, Contabo, or any VPS).  
**Minimum specs**: 2 vCPU, 2GB RAM, 20GB SSD.

### Step 1: Get a VPS

1. Sign up at one of these providers:
   - [DigitalOcean](https://digitalocean.com) — $6/month droplet
   - [Hetzner](https://hetzner.com) — €4.5/month (cheapest)
   - [Contabo](https://contabo.com) — $5/month (great value)
   - Any VPS provider that gives you Ubuntu/Debian

2. Create a server with **Ubuntu 22.04 or 24.04**
3. Note your server's **IP address**

### Step 2: Install Docker on the VPS

SSH into your server and run:

```bash
# Connect to your server
ssh root@YOUR_SERVER_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

### Step 3: Clone Your Code

```bash
# On the VPS
cd /opt
git clone https://github.com/mohamedElayeb/omcs.git
cd omcs
```

### Step 4: Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit with your values
nano .env
```

**Fill in these critical values:**

```env
POSTGRES_PASSWORD=your_strong_db_password_here
JWT_SECRET=generate_a_random_64_char_string_here
BACKEND_PUBLIC_URL=http://YOUR_SERVER_IP:4000
DB_SYNC=true   # ← Keep true for FIRST deploy only
```

> **Generate a JWT secret:**
> ```bash
> openssl rand -hex 32
> ```

### Step 5: Build and Start Everything

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Watch the logs
docker compose -f docker-compose.prod.yml logs -f
```

### Step 6: Seed the Database (First Time Only)

```bash
# Run the seed script inside the backend container
docker compose -f docker-compose.prod.yml exec omcs-backend node -e "
  require('./dist/database/seed');
"

# Or connect to the container and run it manually:
docker compose -f docker-compose.prod.yml exec omcs-backend sh
# Inside the container:
node dist/database/seed.js
```

> **After seeding, change `DB_SYNC=false` in `.env` and restart:**
> ```bash
> docker compose -f docker-compose.prod.yml down
> docker compose -f docker-compose.prod.yml up -d
> ```

### Step 7: Access Your App

| Service | URL |
|---------|-----|
| Admin Dashboard | `http://YOUR_SERVER_IP:4001` |
| Storefront | `http://YOUR_SERVER_IP:4002` |
| Backend API | `http://YOUR_SERVER_IP:4000/api/docs` |

---

## Option B: Railway / Render (Easiest) ⚡

**Best for**: Quick deployment, no server management.  
**Cost**: ~$5-15/month depending on usage.

### Using Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub

2. **Create 3 services from your repo:**

   #### Database:
   - Click **"New Project"** → **"Add PostgreSQL"**
   - Copy the `DATABASE_URL` from the Variables tab

   #### Backend:
   - Click **"New Service"** → **"GitHub Repo"** → select `mohamedElayeb/omcs`
   - Set **Root Directory** = `backend`
   - Set **Build Command** = `npm ci && npm run build`
   - Set **Start Command** = `node dist/main`
   - Add environment variables:
     ```
     NODE_ENV=production
     PORT=4000
     DATABASE_URL=<paste from PostgreSQL service>
     JWT_SECRET=<generate with: openssl rand -hex 32>
     CORS_ORIGINS=*
     DB_SYNC=true
     ```
   - After first deploy succeeds, change `DB_SYNC` to `false`

   #### Frontend:
   - **New Service** → **GitHub Repo** → same repo
   - Set **Root Directory** = `frontend`
   - Set **Build Command** = `npm ci && npm run build`
   - Set **Start Command** = `node .next/standalone/server.js`
   - Add environment variables:
     ```
     NEXT_PUBLIC_API_URL=<your backend Railway URL, e.g. https://omcs-backend-production.up.railway.app>
     ```

   #### Storefront:
   - Same as Frontend but with **Root Directory** = `storefront`

3. Each service gets a public URL automatically

### Using Render

1. Go to [render.com](https://render.com) and sign in
2. Create a **PostgreSQL** database (free tier available)
3. Create 3 **Web Services** from your GitHub repo, each with different root directories (`backend`, `frontend`, `storefront`)
4. Configure environment variables same as Railway

---

## Option C: Domain Names + HTTPS (Production) 🔒

After you have Option A working, add domain names and SSL:

### Step 1: Buy a Domain

- Buy from [Namecheap](https://namecheap.com), [Cloudflare](https://cloudflare.com), or any registrar
- Example: `outletmaster.ly`

### Step 2: Set Up DNS Records

In your domain's DNS settings, create these A records pointing to your VPS IP:

| Type | Name | Value |
|------|------|-------|
| A | `api` | YOUR_SERVER_IP |
| A | `admin` | YOUR_SERVER_IP |
| A | `shop` | YOUR_SERVER_IP |

### Step 3: Update .env with Domain Names

```env
BACKEND_PUBLIC_URL=https://api.outletmaster.ly
CORS_ORIGINS=https://admin.outletmaster.ly,https://shop.outletmaster.ly
```

### Step 4: Add Free SSL with Certbot

```bash
# Install Certbot
apt install certbot -y

# Get certificates (stop nginx first)
docker compose -f docker-compose.prod.yml stop omcs-nginx

certbot certonly --standalone \
  -d api.outletmaster.ly \
  -d admin.outletmaster.ly \
  -d shop.outletmaster.ly

# Copy certs to nginx directory
cp /etc/letsencrypt/live/api.outletmaster.ly/fullchain.pem nginx/certs/
cp /etc/letsencrypt/live/api.outletmaster.ly/privkey.pem nginx/certs/
```

### Step 5: Rebuild with New Config

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 🔄 Updating Your Deployment

After making local changes:

```bash
# 1. Push changes to GitHub
git add .
git commit -m "Update: description of changes"
git push origin main

# 2. On the VPS, pull and rebuild
ssh root@YOUR_SERVER_IP
cd /opt/omcs
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 🔧 Useful Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f omcs-backend

# Restart a service
docker compose -f docker-compose.prod.yml restart omcs-backend

# Stop everything
docker compose -f docker-compose.prod.yml down

# Stop and remove data (⚠️ deletes database!)
docker compose -f docker-compose.prod.yml down -v

# Access database shell
docker compose -f docker-compose.prod.yml exec omcs-db psql -U omcs_user -d omcs

# Check resource usage
docker stats
```

---

## 🛡️ Security Checklist

- [ ] Change `POSTGRES_PASSWORD` from default
- [ ] Generate a strong `JWT_SECRET`  
- [ ] Set `DB_SYNC=false` after first deploy
- [ ] Set `CORS_ORIGINS` to your specific domains (not `*`)
- [ ] Enable HTTPS with SSL certificates
- [ ] Set up a firewall (UFW): only allow ports 22, 80, 443
- [ ] Set up automated backups for PostgreSQL
- [ ] Disable Swagger in production (or password-protect it)

### Firewall Setup (Recommended)

```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

---

## 📊 Architecture Diagram

```
                    Internet
                       │
                       ▼
                 ┌──────────┐
                 │  Nginx   │  :80 / :443
                 │  Proxy   │
                 └────┬─────┘
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Frontend │ │ Backend  │ │Storefront│
    │ (Admin)  │ │  (API)   │ │ (Shop)   │
    │ Next.js  │ │ NestJS   │ │ Next.js  │
    │  :3000   │ │  :4000   │ │  :3000   │
    └──────────┘ └────┬─────┘ └──────────┘
                      │
                 ┌────▼─────┐
                 │PostgreSQL│
                 │  :5432   │
                 └──────────┘
```

---

## 💡 Quick Start Summary

```bash
# On your VPS:
git clone https://github.com/mohamedElayeb/omcs.git
cd omcs
cp .env.example .env
nano .env                                           # Fill in your values
docker compose -f docker-compose.prod.yml up -d --build
# Wait ~2-3 minutes for build...
# Visit http://YOUR_IP:4001 for admin, http://YOUR_IP:4002 for storefront
```
