# Car Rental OS (WheelSys-style MVP)

A starter product for rental car companies to manage fleet, customers, reservations, and quotes.

## What is included

- **Backend API** built with Node.js + Express
- **Frontend dashboard** (plain HTML/CSS/JS) served by the backend
- **Pricing engine** with insurance tiers, add-ons, discount codes, and tax
- **Reservation conflict checks** to prevent overlapping active bookings
- **Seed data** for quick local demo

## Quick start

```bash
npm install
npm run start
```

Open:

- `http://localhost:3000` for the dashboard
- `http://localhost:3000/api/health` for API health check

## Available scripts

- `npm run start` - start server
- `npm run dev` - start server in watch mode
- `npm test` - run tests

## Project structure

```text
.
├── data/
│   └── store.json
├── docs/
│   └── product-blueprint.md
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── data/
│   │   └── store.js
│   ├── domain/
│   │   ├── pricing.js
│   │   └── reservations.js
│   └── server.js
└── tests/
```

## Main API endpoints

- `GET /api/dashboard`
- `GET/POST /api/vehicles`
- `PATCH /api/vehicles/:vehicleId/status`
- `GET/POST /api/customers`
- `GET/POST /api/reservations`
- `PATCH /api/reservations/:reservationId/status`
- `POST /api/quotes`

## Product direction

See [`docs/product-blueprint.md`](docs/product-blueprint.md) for roadmap and module expansion ideas.
