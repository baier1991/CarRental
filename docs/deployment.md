# Deployment Guide (Mobile Friendly)

This repo includes ready configs for one-click deployment on **Render** and **Railway**.

## 1) Render (one click)

1. Open `https://render.com/deploy?repo=https://github.com/baier1991/CarRental`
2. Connect GitHub if prompted
3. Select branch: `cursor/car-rental-product-1caa`
4. Click **Create Web Service**
5. After deploy, open your public URL in mobile browser

The service is configured by `render.yaml` and health checks `GET /api/health`.

## 2) Railway (one click)

1. Open `https://railway.com/new/template?template=https://github.com/baier1991/CarRental`
2. Choose branch: `cursor/car-rental-product-1caa`
3. Deploy
4. Open generated Railway domain from your phone

The service is configured by `railway.json`.

## 3) Docker deployment (any provider)

If your host supports Docker, this repo includes:

- `Dockerfile`
- `.dockerignore`

Container exposes port `3000` and runs `npm run start`.
