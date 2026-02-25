---
description: Deploy OMCS to Railway (backend + DB) and Vercel (frontend + storefront)
---

# Deploy OMCS Online

## Part 1: Railway (Backend + Database)

// turbo-all

1. Go to https://railway.app and sign in with your GitHub account (mohamedElayeb)

2. Click **"New Project"** → **"Provision PostgreSQL"**
   - This creates a free PostgreSQL database
   - Go to the PostgreSQL service → **Variables** tab
   - Copy the `DATABASE_URL` value (you'll need it next)

3. In the same project, click **"New"** → **"GitHub Repo"** → Select **omcs**
   - Set **Root Directory** = `backend`
   - Railway will auto-detect it as a Node.js app

4. Go to the backend service → **Variables** tab → Add these:
   ```
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=<paste the PostgreSQL DATABASE_URL>
   JWT_SECRET=<generate a random string, e.g. run: openssl rand -hex 32>
   CORS_ORIGINS=*
   DB_SYNC=true
   ```

5. Go to **Settings** tab:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node dist/main`
   - In **Networking**, click **"Generate Domain"** to get a public URL
   - Copy the generated URL (e.g. `https://omcs-production-xxxx.up.railway.app`)

6. After the first successful deploy, change `DB_SYNC` to `false` in Variables

## Part 2: Vercel (Frontend + Storefront)

7. Go to https://vercel.com and sign in with your GitHub account

8. Click **"Add New..."** → **"Project"** → Import **omcs** repo

9. Configure the **Admin Frontend**:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js (auto-detected)
   - **Environment Variables**: Add:
     ```
     NEXT_PUBLIC_API_URL=<your Railway backend URL from step 5>
     ```
   - Click **Deploy**

10. Import the repo **again** for the **Storefront**:
    - Click **"Add New..."** → **"Project"** → Import **omcs** again
    - **Root Directory**: `storefront`
    - **Framework Preset**: Next.js
    - **Environment Variables**: Add:
      ```
      NEXT_PUBLIC_API_URL=<your Railway backend URL from step 5>
      ```
    - Click **Deploy**

## Part 3: Update CORS

11. Go back to Railway → Backend service → Variables
    - Update `CORS_ORIGINS` to:
      ```
      https://your-frontend.vercel.app,https://your-storefront.vercel.app
      ```
    - Railway will auto-redeploy

## Done! Your URLs:
- **Backend API**: Railway URL + `/api/docs`
- **Admin Dashboard**: Vercel frontend URL
- **Customer Storefront**: Vercel storefront URL
