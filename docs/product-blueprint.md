# Car Rental OS Blueprint

This repository now contains a practical MVP for a rental-company management product inspired by WheelSys.

## Product Goal

Provide rental businesses with a single operating system to handle:

- Fleet inventory and vehicle availability
- Customer lifecycle management
- Reservation booking with overlap prevention
- Pricing and quote generation with insurance and add-ons
- Basic dashboard analytics for operations and revenue

## MVP Feature Set

### 1) Fleet Management

- Create and list vehicles
- Track vehicle status (`available`, `maintenance`, `inactive`)
- Capture location and daily rental rate

### 2) Customer Management

- Create and list customers
- Store contact information and license number
- Enforce unique email per customer

### 3) Reservations

- Create reservations linked to customer + vehicle
- Validate date ranges
- Prevent overlapping bookings for active reservation states
- Set reservation status (`pending`, `confirmed`, `active`, `completed`, `cancelled`)

### 4) Pricing Engine

- Per-day base pricing
- Insurance tier support (`basic`, `plus`, `premium`)
- Add-ons (`gps`, `childSeat`, `extraDriver`)
- Discount codes (`WEEKLY10`, `CORPORATE15`)
- Tax and total calculation

### 5) Dashboard

- Fleet size
- Available vehicles
- Active reservations and customers
- Utilization rate
- Expected revenue from active reservations

## Suggested Next Milestones

1. **Contracts and invoicing** (PDF agreements + payment schedules)
2. **Maintenance workflows** (service logs, inspections, downtime tracking)
3. **Multi-branch operation** (branch inventory balancing)
4. **Role-based access** (admins, agents, finance, operations)
5. **Integrations** (payment gateways, GPS/telematics, accounting software)
