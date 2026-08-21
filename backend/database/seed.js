const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { initDb, run, query, get } = require('./db');

async function runSeed() {
    console.log('Checking database seed status...');

    await initDb();

    // Check if events already exist
    const existingEvents = await get('SELECT COUNT(*) as count FROM events');
    if (existingEvents && existingEvents.count > 0) {
        console.log(`Database already populated with ${existingEvents.count} events.`);
        return;
    }

    console.log('Seeding initial users, venues, seat layouts, and events...');

    // 1. Users
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const users = [
        { name: 'System Admin', email: 'admin@ticketflow.com', role: 'admin', phone: '+91 9876543210' },
        { name: 'Global Events Co.', email: 'organiser@ticketflow.com', role: 'organiser', phone: '+91 9876543211' },
        { name: 'Alex Johnson', email: 'customer@example.com', role: 'customer', phone: '+91 9876543212' },
        { name: 'Sarah Miller', email: 'user2@example.com', role: 'customer', phone: '+91 9876543213' }
    ];

    for (const u of users) {
        const existing = await get('SELECT id FROM users WHERE email = ?', [u.email]);
        if (!existing) {
            await run(
                'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
                [u.name, u.email, passwordHash, u.role, u.phone]
            );
            console.log(`Created user: ${u.email} (${u.role})`);
        }
    }

    const organiserUser = await get('SELECT id FROM users WHERE email = ?', ['organiser@ticketflow.com']);

    // 2. Venues & Seat Layouts
    const venuesToCreate = [
        {
            name: 'Grand Arena Stadium',
            location: 'Chennai',
            address: '100 Marina Bay Drive, Chennai',
            capacity: 64,
            rowsCount: 8,
            seatsPerRow: 8
        },
        {
            name: 'Starlight Dolby Cinema',
            location: 'Vellore',
            address: 'VIT Convention Centre, Katpadi',
            capacity: 40,
            rowsCount: 5,
            seatsPerRow: 8
        },
        {
            name: 'M. A. Chidambaram Cricket Stadium (Chepauk)',
            location: 'Chennai',
            address: 'Victoria Hostel Rd, Chepauk, Chennai',
            capacity: 64,
            rowsCount: 8,
            seatsPerRow: 8
        },
        {
            name: 'Jawaharlal Nehru Indoor Arena',
            location: 'Chennai',
            address: 'Periamet, Park Town, Chennai',
            capacity: 40,
            rowsCount: 5,
            seatsPerRow: 8
        },
        {
            name: 'Nehru Sports Complex',
            location: 'Coimbatore',
            address: 'VNS Nagar, Coimbatore',
            capacity: 64,
            rowsCount: 8,
            seatsPerRow: 8
        }
    ];

    const venueMap = {};

    for (const vData of venuesToCreate) {
        let vObj = await get('SELECT id FROM venues WHERE name = ?', [vData.name]);
        if (!vObj) {
            const res = await run(
                'INSERT INTO venues (name, location, address, capacity) VALUES (?, ?, ?, ?)',
                [vData.name, vData.location, vData.address, vData.capacity]
            );
            vObj = { id: res.lastID };

            const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
            for (let rIdx = 0; rIdx < vData.rowsCount; rIdx++) {
                const rowLabel = rows[rIdx];
                let category = 'Economy';
                if (rIdx < 2) category = 'VIP';
                else if (rIdx < 4) category = 'Premium';
                else if (rIdx < 6) category = 'Standard';

                for (let num = 1; num <= vData.seatsPerRow; num++) {
                    await run(
                        'INSERT INTO venue_seats (venue_id, row_label, seat_number, category, pos_x, pos_y, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [vObj.id, rowLabel, num, category, (num - 1) * 45, rIdx * 45, 'active']
                    );
                }
            }
            console.log(`Created venue: ${vData.name} (${vData.location})`);
        }
        venueMap[vData.name] = vObj.id;
    }

    // 3. Events & Event Seat Snapshots
    const eventsData = [
        {
            title: 'Coldplay Live in Chennai - Music of the Spheres',
            event_type: 'concert',
            description: 'Experience the world-renowned Coldplay live in concert! Featuring breathtaking visuals, laser light shows, and hits like Yellow, Viva La Vida, and Fix You.',
            poster_url: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1000&q=80',
            venue_id: venueMap['Grand Arena Stadium'],
            organiser_id: organiserUser.id,
            start_date: '2026-09-20 19:30:00',
            duration_mins: 180,
            prices: { VIP: 3999, Premium: 2499, Standard: 1499, Economy: 999 }
        },
        {
            title: 'Avatar: Fire & Ash (3D IMAX)',
            event_type: 'movie',
            description: 'Return to Pandora in James Cameron’s latest visual masterpiece. High frame rate 3D immersive cinema experience.',
            poster_url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1000&q=80',
            venue_id: venueMap['Starlight Dolby Cinema'],
            organiser_id: organiserUser.id,
            start_date: '2026-08-25 18:00:00',
            duration_mins: 195,
            prices: { VIP: 650, Premium: 450, Standard: 300, Economy: 200 }
        },
        {
            title: 'IPL 2026: Chennai Super Kings vs Mumbai Indians',
            event_type: 'sports',
            description: 'El Clásico of Indian T20 Cricket! Live at Chepauk Stadium. Witness high-octane action, roaring crowds, and blockbuster boundary hits.',
            poster_url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1000&q=80',
            venue_id: venueMap['M. A. Chidambaram Cricket Stadium (Chepauk)'],
            organiser_id: organiserUser.id,
            start_date: '2026-09-12 19:30:00',
            duration_mins: 210,
            prices: { VIP: 4999, Premium: 2999, Standard: 1499, Economy: 899 }
        },
        {
            title: 'ISL Football Final: Chennaiyin FC vs Bengaluru FC',
            event_type: 'sports',
            description: 'Southern Derby Final match! High-intensity Indian Super League championship football thrilling showdown.',
            poster_url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1000&q=80',
            venue_id: venueMap['Nehru Sports Complex'],
            organiser_id: organiserUser.id,
            start_date: '2026-10-05 19:00:00',
            duration_mins: 120,
            prices: { VIP: 2499, Premium: 1499, Standard: 899, Economy: 499 }
        },
        {
            title: 'Pro Kabaddi: Tamil Thalaivas vs Patna Pirates',
            event_type: 'sports',
            description: 'Fast-paced indoor kabaddi action live in Chennai! Super raids, tackles, and intense athleticism.',
            poster_url: 'https://images.unsplash.com/photo-1517649763962-0c623266010b?auto=format&fit=crop&w=1000&q=80',
            venue_id: venueMap['Jawaharlal Nehru Indoor Arena'],
            organiser_id: organiserUser.id,
            start_date: '2026-09-08 20:00:00',
            duration_mins: 90,
            prices: { VIP: 1800, Premium: 1200, Standard: 650, Economy: 350 }
        },
        {
            title: 'A.R. Rahman Symphony Night',
            event_type: 'concert',
            description: 'Oscar & Grammy winner A.R. Rahman conducts an extraordinary orchestral performance live with a 75-piece symphony orchestra.',
            poster_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1000&q=80',
            venue_id: venueMap['Grand Arena Stadium'],
            organiser_id: organiserUser.id,
            start_date: '2026-10-10 20:00:00',
            duration_mins: 150,
            prices: { VIP: 4999, Premium: 2999, Standard: 1899, Economy: 1199 }
        },
        {
            title: 'Interstellar - 10th Anniversary IMAX',
            event_type: 'movie',
            description: 'Christopher Nolan’s sci-fi epic back on the big screen with Hans Zimmer’s iconic score remastered in Dolby Atmos.',
            poster_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1000&q=80',
            venue_id: venueMap['Starlight Dolby Cinema'],
            organiser_id: organiserUser.id,
            start_date: '2026-09-01 21:00:00',
            duration_mins: 169,
            prices: { VIP: 500, Premium: 380, Standard: 280, Economy: 180 }
        }
    ];

    for (const ev of eventsData) {
        const existingEv = await get('SELECT id FROM events WHERE title = ?', [ev.title]);
        let eventId;
        if (!existingEv) {
            const res = await run(
                'INSERT INTO events (title, event_type, description, poster_url, venue_id, organiser_id, start_date, duration_mins, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [ev.title, ev.event_type, ev.description, ev.poster_url, ev.venue_id, ev.organiser_id, ev.start_date, ev.duration_mins, 'published']
            );
            eventId = res.lastID;
            console.log(`Created event: ${ev.title} (${ev.event_type})`);

            // Snapshot venue seats into event_seats
            const vSeats = await query('SELECT * FROM venue_seats WHERE venue_id = ?', [ev.venue_id]);
            for (const vs of vSeats) {
                const seatPrice = ev.prices[vs.category] || 250;
                await run(
                    'INSERT INTO event_seats (event_id, venue_seat_id, row_label, seat_number, category, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [eventId, vs.id, vs.row_label, vs.seat_number, vs.category, seatPrice, 'AVAILABLE']
                );
            }
            console.log(`Created ${vSeats.length} seat inventory records for event #${eventId}`);
        }
    }

    console.log('Seeding completed successfully!');
}

if (require.main === module) {
    runSeed().then(() => process.exit(0)).catch(err => {
        console.error('Seed error:', err);
        process.exit(1);
    });
}

module.exports = { runSeed };
