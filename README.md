# Car Rental OS (WheelSys-style MVP)

A starter product for rental car companies to manage fleet, customers, reservations, and quotes.

## What is included

- **Backend API** built with Node.js + Express
- **Frontend dashboard** split by section with sidebar navigation
- **Role-based menu visibility** (`admin`, `operations`, `agent`) with page-level access controls
- **Pricing engine** with insurance tiers, add-ons, discount codes, and tax
- **Reservation conflict checks** to prevent overlapping active bookings
- **Advanced vehicle intake** with VIN, category, branch, compliance dates, service schedule, and rate plans
- **Vehicle editing workflows** for rates, status, odometer, compliance, and service updates
- **Bulk CSV fleet import** for onboarding many cars at once
- **Vehicle document upload** (registration/insurance/inspection/contracts)
- **Maintenance work orders** linked to each vehicle
- **Seed data** for quick local demo

## Quick start

```bash
npm install
npm run start
```

Open:

- `http://localhost:3000` for the home dashboard
- `http://localhost:3000/api/health` for API health check

Main UI routes:

- `/` - Home
- `/fleet.html` - Fleet
- `/customers.html` - Customers
- `/reservations.html` - Reservations
- `/maintenance.html` - Maintenance & Documents

If demo records are missing in a deployed environment:

- Open home (`/`) and click **Restore Demo Data**, or
- Call `POST /api/admin/seed-demo`

## One-click cloud deploy (open on mobile)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/baier1991/CarRental)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/baier1991/CarRental)

After clicking, choose branch: `cursor/car-rental-product-1caa`.

Detailed steps: [`docs/deployment.md`](docs/deployment.md)

## Available scripts

- `npm run start` - start server
- `npm run dev` - start server in watch mode
- `npm test` - run tests

## Project structure

```text
.
├── data/
│   └── store.json
├── Dockerfile
├── docs/
│   ├── deployment.md
│   └── product-blueprint.md
├── public/
│   ├── common.js
│   ├── customers.html
│   ├── customers.js
│   ├── fleet.html
│   ├── fleet.js
│   ├── home.js
│   ├── index.html
│   ├── maintenance.html
│   ├── maintenance.js
│   ├── reservations.html
│   ├── reservations.js
│   └── styles.css
├── railway.json
├── render.yaml
├── src/
│   ├── data/
│   │   └── store.js
│   ├── domain/
│   │   ├── vehicleImport.js
│   │   ├── vehicles.js
│   │   ├── workOrders.js
│   │   ├── pricing.js
│   │   └── reservations.js
│   └── server.js
└── tests/
```

## Main API endpoints

- `GET /api/dashboard`
- `GET/POST /api/vehicles`
- `PATCH /api/vehicles/:vehicleId`
- `PATCH /api/vehicles/:vehicleId/status`
- `POST /api/vehicles/import-csv`
- `GET/POST /api/vehicles/:vehicleId/documents`
- `DELETE /api/vehicles/:vehicleId/documents/:documentId`
- `GET /api/work-orders`
- `GET/POST /api/vehicles/:vehicleId/work-orders`
- `PATCH /api/work-orders/:workOrderId`
- `GET/POST /api/customers`
- `GET/POST /api/reservations`
- `PATCH /api/reservations/:reservationId/status`
- `POST /api/quotes`

## Product direction

See [`docs/product-blueprint.md`](docs/product-blueprint.md) for roadmap and module expansion ideas.
