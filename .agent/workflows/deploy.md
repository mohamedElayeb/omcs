---
description: Deploy OMCS to Railway (backend + DB) and Vercel (frontend + storefront)
---

# Deploy OMCS

## URLs
- **Backend API**: https://omcs-production.up.railway.app
- **Frontend (Admin)**: https://omcs-three.vercel.app
- **API Docs**: https://omcs-production.up.railway.app/api/docs

## Railway (Backend + DB)
- **Project**: poetic-illumination
- **Services**: Postgres + omcs (backend)
- **Backend Variables**: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`
- **Builder**: Dockerfile at `backend/Dockerfile`
- **Start command**: `npm run start:prod`

## Vercel (Frontend)
- **Project**: omcs
- **Root Directory**: `frontend`
- **Env Variable**: `NEXT_PUBLIC_API_URL=https://omcs-production.up.railway.app`

## Deploying Updates
// turbo-all

1. Make your code changes locally
2. Push to GitHub:
```bash
git add -A
git commit -m "your message"
git push origin main
```
3. Railway auto-deploys the backend from the `main` branch
4. Vercel auto-deploys the frontend from the `main` branch
5. No manual steps needed — both services watch the GitHub repo

## First-Time Setup Notes
- The backend auto-seeds the database on startup if the `users` table is empty
- JWT_SECRET must be set in Railway variables or login will fail with 500
- The backend listens on Railway's PORT (8080), not the default 4000
- Swagger docs are always enabled at `/api/docs`

## Login Credentials
- **Owner**: admin@outletmaster.ly / Admin123!
- **Owner**: mohamed@outletmaster.ly / Admin123!
- **Manager**: manager1@outletmaster.ly / Admin123!
- **Cashier**: cashier1@outletmaster.ly / Cashier123!
