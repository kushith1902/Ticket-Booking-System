# TicketFlow - Production-Grade Real-World Ticket Booking System (Movies & Concerts)

TicketFlow is a high-end, commercial-quality ticket booking system for Movies and Concerts built with **HTML5 + CSS3 + Vanilla JavaScript (ES Modules)** on the frontend and powered by a **Node.js + Express + Socket.IO + SQLite** backend.

The platform provides a real-world multi-user experience featuring:
- **Transactional Seat Concurrency Protection** (Server-side atomic database locks preventing double-booking)
- **Interactive Visual Cinema & Concert Seat Selection Canvas** (Stage screen, seat category tiers, live status indicators)
- **10-Minute Hold TTL Enforcement** (Server-authoritative timers with automatic seat release background workers)
- **Real-Time WebSocket Synchronization** (Socket.IO broadcasts seat holds, releases, bookings, and waitlist offers without page refreshes)
- **Digital Boarding-Pass Style Tickets & Gate Entry QR Codes**
- **Automated Waitlist FIFO Queueing & Time-Limited Ticket Offers**
- **Organiser Analytics Portal & Admin Visual Venue Layout Builder Editor**

---

## 🛠 Technology Stack

- **Frontend:** Pure HTML5, Vanilla CSS3 (Custom Design Tokens), Vanilla JavaScript (ES Modules, Fetch API, Socket.IO Client). Zero heavy framework dependencies.
- **Backend:** Node.js, Express.js framework, Socket.IO WebSockets.
- **Database:** SQLite with WAL mode & atomic transactional locking.
- **Background Jobs:** Node.js in-process TTL worker scanning expired holds & auto-assigning waitlist queue offers.
- **QR Code & Email Services:** `qrcode` generation & Nodemailer (Ethereal test SMTP integration).

---

## 🚀 Quick Start & Startup Guide

### Prerequisites
- Node.js (v16+)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Seed Database
Initialize SQLite schema and seed demo events, venues, seats, and test accounts:
```bash
npm run seed
```

### 3. Start the Server
Start the backend server on `http://localhost:3000`:
```bash
npm start
```

---

## 🔑 Demo Login Accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| **Customer** | `customer@example.com` | `Password123!` |
| **Organiser** | `organiser@ticketflow.com` | `Password123!` |
| **Admin** | `admin@ticketflow.com` | `Password123!` |

---

## 🧪 Verification & Concurrency Testing

To verify double-booking prevention under simultaneous atomic requests, run:
```bash
npm run test:concurrency
```
*Expected Result:* Exactly 1 request succeeds with seat hold lock and 1 request receives an `HTTP 409 Conflict` error.

---

## 📁 System Architecture

```text
ticket-booking-system/
│
├── backend/
│   ├── server.js                  # Express & Socket.IO server setup
│   ├── database/
│   │   ├── db.js                  # SQLite connection & transaction manager
│   │   ├── schema.sql             # Relational SQL tables
│   │   └── seed.js                # Initial database seeder
│   ├── middleware/
│   │   └── auth.js                # JWT auth & role access control
│   ├── routes/
│   │   ├── auth.js                # Register, login, profile routes
│   │   ├── events.js              # Event browsing, filter, search, creation
│   │   ├── seats.js               # Interactive seat map & atomic hold locks
│   │   ├── bookings.js            # Transactional checkout, ticket & QR generation
│   │   ├── waitlist.js            # FIFO queueing & time-limited offer claims
│   │   ├── venues.js              # Venue management & visual builder persistence
│   │   └── dashboard.js           # Analytics metrics for Organisers & Admins
│   ├── jobs/
│   │   └── ttlWorker.js           # TTL hold release & waitlist reassignment worker
│   ├── services/
│   │   └── emailService.js        # Nodemailer QR ticket receipts & offer emails
│   └── websocket/
│       └── socketHandler.js       # Real-time Socket.IO event broadcaster
│
├── frontend/
│   ├── index.html                 # Hero, search & featured events landing
│   ├── login.html & register.html # Auth pages
│   ├── events.html                # Event discovery & filter drawer
│   ├── event-details.html         # Event metadata & category availability
│   ├── seat-selection.html        # Interactive visual seat map & hold timer
│   ├── checkout.html              # Checkout breakdown & payment method UI
│   ├── booking-success.html       # Confirmation page with QR Code
│   ├── ticket.html                # Digital Boarding Pass QR Ticket
│   ├── bookings.html              # Customer booking history & cancellation
│   ├── waitlist.html              # Customer waitlist dashboard & offer claim
│   ├── organiser/                 # Organiser Portal (Dashboard, Create Event)
│   ├── admin/                     # Admin Portal (Dashboard, Venue Builder Editor)
│   ├── css/                       # Modular CSS design system
│   └── js/                        # Modular JavaScript client modules
│
├── tests/
│   └── concurrency_test.js        # Automated dual-request concurrency script
│
├── package.json
└── README.md
```
