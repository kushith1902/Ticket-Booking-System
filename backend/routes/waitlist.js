const express = require('express');
const router = express.Router();
const { query, get, run, transaction } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { emitSeatStatusChange } = require('../websocket/socketHandler');

// POST /api/events/:id/waitlist - Join waitlist for sold-out category
router.post('/events/:id/waitlist', authenticateToken, async (req, res) => {
    try {
        const eventId = req.params.id;
        const { category } = req.body;
        const userId = req.user.id;

        if (!category) {
            return res.status(400).json({ error: 'Seat category is required' });
        }

        // Check if user already waiting on waitlist for this category
        const existing = await get(
            `SELECT id, position FROM waitlist_entries WHERE event_id = ? AND user_id = ? AND category = ? AND status = 'WAITING'`,
            [eventId, userId, category]
        );

        if (existing) {
            return res.status(400).json({
                error: 'You are already on the waitlist for this category',
                position: existing.position
            });
        }

        // Calculate queue position FIFO
        const posRow = await get(
            `SELECT COUNT(*) as count FROM waitlist_entries WHERE event_id = ? AND category = ? AND status = 'WAITING'`,
            [eventId, category]
        );
        const position = (posRow ? posRow.count : 0) + 1;

        const resWait = await run(
            `INSERT INTO waitlist_entries (event_id, user_id, category, position, status) VALUES (?, ?, ?, ?, 'WAITING')`,
            [eventId, userId, category, position]
        );

        res.status(201).json({
            message: 'Joined waitlist successfully!',
            waitlistId: resWait.lastID,
            category,
            position
        });
    } catch (err) {
        console.error('Join waitlist error:', err);
        res.status(500).json({ error: 'Failed to join waitlist' });
    }
});

// GET /api/waitlist/my - Customer active waitlists
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const waitlists = await query(
            `SELECT we.*, e.title as event_title, e.poster_url, e.start_date, v.name as venue_name,
                    wo.offer_token, wo.expires_at as offer_expires_at, wo.status as offer_status,
                    es.row_label, es.seat_number
             FROM waitlist_entries we
             JOIN events e ON we.event_id = e.id
             JOIN venues v ON e.venue_id = v.id
             LEFT JOIN waitlist_offers wo ON we.id = wo.waitlist_id AND wo.status = 'PENDING' AND datetime(wo.expires_at) > datetime('now')
             LEFT JOIN event_seats es ON wo.seat_id = es.id
             WHERE we.user_id = ? AND we.status IN ('WAITING', 'OFFERED')
             ORDER BY we.created_at DESC`,
            [userId]
        );

        res.json({ waitlists });
    } catch (err) {
        console.error('Error fetching waitlists:', err);
        res.status(500).json({ error: 'Failed to retrieve waitlist entries' });
    }
});

// POST /api/waitlist/offers/:token/claim - Claim waitlist ticket offer
router.post('/offers/:token/claim', authenticateToken, async (req, res) => {
    try {
        const offerToken = req.params.token;
        const userId = req.user.id;
        const now = new Date().toISOString();

        const offer = await get(
            `SELECT wo.*, es.price, es.category, es.row_label, es.seat_number
             FROM waitlist_offers wo
             JOIN event_seats es ON wo.seat_id = es.id
             WHERE wo.offer_token = ? AND wo.user_id = ? AND wo.status = 'PENDING' AND datetime(wo.expires_at) > datetime(?)`,
            [offerToken, userId, now]
        );

        if (!offer) {
            return res.status(404).json({ error: 'Offer has expired or is invalid' });
        }

        const result = await transaction(async () => {
            // Mark offer as CLAIMED
            await run(`UPDATE waitlist_offers SET status = 'CLAIMED' WHERE id = ?`, [offer.id]);
            // Mark waitlist entry as CLAIMED
            await run(`UPDATE waitlist_entries SET status = 'CLAIMED' WHERE id = ?`, [offer.waitlist_id]);

            // Convert into an active 10-minute seat hold for checkout!
            const holdTTL = parseInt(process.env.HOLD_TTL_MINUTES || '10', 10);
            const expiresAtDate = new Date(Date.now() + holdTTL * 60 * 1000);
            const expiresAtStr = expiresAtDate.toISOString().replace('T', ' ').substring(0, 19);

            await run(
                `INSERT INTO seat_holds (event_id, seat_id, user_id, hold_token, expires_at, status)
                 VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
                [offer.event_id, offer.seat_id, userId, offerToken, expiresAtStr]
            );

            return { eventId: offer.event_id, seatId: offer.seat_id, expiresAt: expiresAtStr };
        });

        res.json({
            message: 'Offer claimed! Seat reserved for checkout.',
            eventId: result.eventId,
            seatId: result.seatId,
            expiresAt: result.expiresAt
        });
    } catch (err) {
        console.error('Claim offer error:', err);
        res.status(500).json({ error: 'Failed to claim offer' });
    }
});

module.exports = router;
