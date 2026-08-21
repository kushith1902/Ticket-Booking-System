const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/events - Filterable event list
router.get('/', async (req, res) => {
    try {
        const { type, city, search, date, sort, limit, offset } = req.query;

        let sql = `
            SELECT e.*, v.name as venue_name, v.location as venue_location, v.address as venue_address,
                   (SELECT COUNT(*) FROM event_seats es WHERE es.event_id = e.id AND es.status = 'AVAILABLE') as available_seats,
                   (SELECT COUNT(*) FROM event_seats es WHERE es.event_id = e.id) as total_seats,
                   (SELECT MIN(price) FROM event_seats es WHERE es.event_id = e.id) as min_price
            FROM events e
            JOIN venues v ON e.venue_id = v.id
            WHERE e.status = 'published'
        `;

        const params = [];

        if (type && type !== 'all') {
            sql += ` AND e.event_type = ?`;
            params.push(type);
        }

        if (city && city !== 'all') {
            sql += ` AND v.location LIKE ?`;
            params.push(`%${city}%`);
        }

        if (search) {
            sql += ` AND (e.title LIKE ? OR e.description LIKE ? OR v.name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (date) {
            sql += ` AND DATE(e.start_date) = DATE(?)`;
            params.push(date);
        }

        if (sort === 'price_low') {
            sql += ` ORDER BY min_price ASC`;
        } else if (sort === 'price_high') {
            sql += ` ORDER BY min_price DESC`;
        } else if (sort === 'date_asc') {
            sql += ` ORDER BY e.start_date ASC`;
        } else {
            sql += ` ORDER BY e.start_date ASC`;
        }

        if (limit) {
            sql += ` LIMIT ? OFFSET ?`;
            params.push(parseInt(limit, 10), parseInt(offset || '0', 10));
        }

        const events = await query(sql, params);
        res.json({ events });
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: 'Failed to retrieve events' });
    }
});

// GET /api/events/:id - Event details & category availability breakdown
router.get('/:id', async (req, res) => {
    try {
        const eventId = req.params.id;

        const event = await get(
            `SELECT e.*, v.name as venue_name, v.location as venue_location, v.address as venue_address,
                    u.name as organiser_name
             FROM events e
             JOIN venues v ON e.venue_id = v.id
             JOIN users u ON e.organiser_id = u.id
             WHERE e.id = ?`,
            [eventId]
        );

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        // Category breakdown with min prices and availability
        const categories = await query(
            `SELECT category, price,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_count
             FROM event_seats
             WHERE event_id = ?
             GROUP BY category, price
             ORDER BY price DESC`,
            [eventId]
        );

        res.json({ event, categories });
    } catch (err) {
        console.error('Error fetching event details:', err);
        res.status(500).json({ error: 'Failed to retrieve event details' });
    }
});

// POST /api/events - Create new event (Organiser / Admin)
router.post('/', authenticateToken, requireRole('organiser', 'admin'), async (req, res) => {
    try {
        const { title, event_type, description, poster_url, venue_id, start_date, duration_mins, prices } = req.body;

        if (!title || !event_type || !venue_id || !start_date || !prices) {
            return res.status(400).json({ error: 'Missing required event fields' });
        }

        const venue = await get('SELECT * FROM venues WHERE id = ?', [venue_id]);
        if (!venue) {
            return res.status(404).json({ error: 'Selected venue does not exist' });
        }

        const result = await transaction(async () => {
            const resEvent = await run(
                `INSERT INTO events (title, event_type, description, poster_url, venue_id, organiser_id, start_date, duration_mins, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
                [
                    title,
                    event_type,
                    description || '',
                    poster_url || 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1000&q=80',
                    venue_id,
                    req.user.id,
                    start_date,
                    duration_mins || 120
                ]
            );

            const eventId = resEvent.lastID;

            // Snapshot venue layout to event_seats with category pricing
            const vSeats = await query('SELECT * FROM venue_seats WHERE venue_id = ?', [venue_id]);
            for (const vs of vSeats) {
                const seatPrice = prices[vs.category] || 250;
                await run(
                    `INSERT INTO event_seats (event_id, venue_seat_id, row_label, seat_number, category, price, status)
                     VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE')`,
                    [eventId, vs.id, vs.row_label, vs.seat_number, vs.category, seatPrice]
                );
            }

            return eventId;
        });

        res.status(201).json({ message: 'Event created successfully', eventId: result });
    } catch (err) {
        console.error('Create event error:', err);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

module.exports = router;
