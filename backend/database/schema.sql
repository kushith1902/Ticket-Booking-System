-- SQL Schema for Ticket Booking Platform (SQLite compatible)

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('customer', 'organiser', 'admin')) NOT NULL DEFAULT 'customer',
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    address TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    layout_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS venue_seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id INTEGER NOT NULL,
    row_label TEXT NOT NULL,
    seat_number INTEGER NOT NULL,
    category TEXT CHECK(category IN ('VIP', 'Premium', 'Standard', 'Economy')) NOT NULL DEFAULT 'Standard',
    pos_x INTEGER DEFAULT 0,
    pos_y INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('active', 'blocked')) DEFAULT 'active',
    FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_type TEXT CHECK(event_type IN ('movie', 'concert', 'sports')) NOT NULL,
    description TEXT,
    poster_url TEXT,
    venue_id INTEGER NOT NULL,
    organiser_id INTEGER NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME,
    duration_mins INTEGER DEFAULT 120,
    status TEXT CHECK(status IN ('draft', 'published', 'cancelled')) DEFAULT 'published',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES venues(id),
    FOREIGN KEY (organiser_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS event_seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    venue_seat_id INTEGER,
    row_label TEXT NOT NULL,
    seat_number INTEGER NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT CHECK(status IN ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED')) DEFAULT 'AVAILABLE',
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seat_holds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    hold_token TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    status TEXT CHECK(status IN ('ACTIVE', 'EXPIRED', 'CONSUMED', 'RELEASED')) DEFAULT 'ACTIVE',
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (seat_id) REFERENCES event_seats(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    booking_fee REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    status TEXT CHECK(status IN ('CONFIRMED', 'CANCELLED')) DEFAULT 'CONFIRMED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS booking_seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (seat_id) REFERENCES event_seats(id)
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    position INTEGER NOT NULL,
    status TEXT CHECK(status IN ('WAITING', 'OFFERED', 'EXPIRED', 'CLAIMED', 'CANCELLED')) DEFAULT 'WAITING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS waitlist_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    waitlist_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    offer_token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    status TEXT CHECK(status IN ('PENDING', 'CLAIMED', 'EXPIRED')) DEFAULT 'PENDING',
    FOREIGN KEY (waitlist_id) REFERENCES waitlist_entries(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (seat_id) REFERENCES event_seats(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
