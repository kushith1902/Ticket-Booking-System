const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/venues - List all venues
router.get('/', async (req, res) => {
    try {
        const venues = await query(`
            SELECT v.*, (SELECT COUNT(*) FROM venue_seats vs WHERE vs.venue_id = v.id) as seat_count
            FROM venues v
            ORDER BY v.name ASC
        `);
        res.json({ venues });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch venues' });
    }
});

// GET /api/venues/:id - Get venue with layout seats
router.get('/:id', async (req, res) => {
    try {
        const venue = await get('SELECT * FROM venues WHERE id = ?', [req.params.id]);
        if (!venue) {
            return res.status(404).json({ error: 'Venue not found' });
        }
        const seats = await query('SELECT * FROM venue_seats WHERE venue_id = ? ORDER BY row_label, seat_number', [venue.id]);
        res.json({ venue, seats });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch venue details' });
    }
});

// POST /api/venues - Create new venue with visual seat layout (Admin)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, location, address, rows, seatsPerRow, layoutSeats } = req.body;

        if (!name || !location || !address) {
            return res.status(400).json({ error: 'Name, location, and address are required' });
        }

        const venueId = await transaction(async () => {
            const resVenue = await run(
                `INSERT INTO venues (name, location, address, capacity, layout_json) VALUES (?, ?, ?, ?, ?)`,
                [name, location, address, layoutSeats ? layoutSeats.length : (rows * seatsPerRow), JSON.stringify(layoutSeats || [])]
            );
            const vId = resVenue.lastID;

            if (Array.isArray(layoutSeats) && layoutSeats.length > 0) {
                for (const s of layoutSeats) {
                    await run(
                        `INSERT INTO venue_seats (venue_id, row_label, seat_number, category, pos_x, pos_y, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [vId, s.rowLabel, s.seatNumber, s.category || 'Standard', s.posX || 0, s.posY || 0, s.status || 'active']
                    );
                }
            } else if (rows && seatsPerRow) {
                const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
                for (let r = 0; r < Math.min(rows, rowLabels.length); r++) {
                    const label = rowLabels[r];
                    let cat = 'Standard';
                    if (r === 0) cat = 'VIP';
                    else if (r === 1) cat = 'Premium';
                    else if (r >= rows - 2) cat = 'Economy';

                    for (let s = 1; s <= seatsPerRow; s++) {
                        await run(
                            `INSERT INTO venue_seats (venue_id, row_label, seat_number, category, pos_x, pos_y, status)
                             VALUES (?, ?, ?, ?, ?, ?, 'active')`,
                            [vId, label, s, cat, (s - 1) * 45, r * 45]
                        );
                    }
                }
            }

            return vId;
        });

        res.status(201).json({ message: 'Venue created successfully', venueId });
    } catch (err) {
        console.error('Error creating venue:', err);
        res.status(500).json({ error: 'Failed to create venue' });
    }
});

module.exports = router;
