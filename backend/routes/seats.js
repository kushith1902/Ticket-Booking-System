const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, get, run, transaction } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { emitSeatStatusChange } = require('../websocket/socketHandler');

// GET /api/events/:id/seats - Get seat layout & real-time status for an event
router.get('/events/:id/seats', async (req, res) => {
    try {
        const eventId = req.params.id;

        const event = await get('SELECT id, title, start_date, venue_id FROM events WHERE id = ?', [eventId]);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const seats = await query(
            `SELECT es.*, sh.user_id as held_by_user, sh.expires_at as hold_expires_at
             FROM event_seats es
             LEFT JOIN seat_holds sh ON es.id = sh.seat_id AND sh.status = 'ACTIVE' AND datetime(sh.expires_at) > datetime('now')
             WHERE es.event_id = ?
             ORDER BY es.row_label ASC, es.seat_number ASC`,
            [eventId]
        );

        res.json({ event, seats });
    } catch (err) {
        console.error('Error fetching seats:', err);
        res.status(500).json({ error: 'Failed to retrieve seat map' });
    }
});

// POST /api/seats/hold - Atomic Transactional Seat Hold Placement
router.post('/hold', authenticateToken, async (req, res) => {
    try {
        const { eventId, seatIds } = req.body;
        const userId = req.user.id;

        if (!eventId || !Array.isArray(seatIds) || seatIds.length === 0) {
            return res.status(400).json({ error: 'Event ID and array of seat IDs are required' });
        }

        const holdTTL = parseInt(process.env.HOLD_TTL_MINUTES || '10', 10);
        const expiresAtDate = new Date(Date.now() + holdTTL * 60 * 1000);
        const expiresAtStr = expiresAtDate.toISOString().replace('T', ' ').substring(0, 19);
        const holdToken = 'HLD-' + crypto.randomBytes(8).toString('hex').toUpperCase();

        const result = await transaction(async () => {
            // Check availability of all requested seats inside transaction lock
            for (const sId of seatIds) {
                const seat = await get(
                    `SELECT * FROM event_seats WHERE id = ? AND event_id = ?`,
                    [sId, eventId]
                );

                if (!seat) {
                    throw new Error(`Seat ID ${sId} does not exist for this event.`);
                }

                if (seat.status !== 'AVAILABLE') {
                    throw new Error(`Seat ${seat.row_label}${seat.seat_number} is no longer available (Status: ${seat.status}).`);
                }
            }

            // Lock seats by setting status = 'HELD' and inserting seat_holds
            for (const sId of seatIds) {
                await run(`UPDATE event_seats SET status = 'HELD' WHERE id = ?`, [sId]);
                await run(
                    `INSERT INTO seat_holds (event_id, seat_id, user_id, hold_token, expires_at, status)
                     VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
                    [eventId, sId, userId, holdToken, expiresAtStr]
                );
            }

            return { holdToken, expiresAt: expiresAtStr };
        });

        // Broadcast real-time Socket.IO update to all connected users viewing seat map
        emitSeatStatusChange(eventId, seatIds, 'HELD', userId);

        res.json({
            message: 'Seats held successfully',
            holdToken: result.holdToken,
            expiresAt: result.expiresAt,
            holdTTLMinutes: holdTTL,
            seatIds
        });
    } catch (err) {
        console.warn('Seat hold transaction conflict/error:', err.message);
        res.status(409).json({ error: err.message || 'Seat hold conflict: One or more selected seats were just claimed by another user.' });
    }
});

// POST /api/seats/release - Manually release held seats
router.post('/release', authenticateToken, async (req, res) => {
    try {
        const { eventId, seatIds } = req.body;
        const userId = req.user.id;

        if (!eventId || !Array.isArray(seatIds)) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        await transaction(async () => {
            for (const sId of seatIds) {
                await run(
                    `UPDATE seat_holds SET status = 'RELEASED' WHERE seat_id = ? AND user_id = ? AND status = 'ACTIVE'`,
                    [sId, userId]
                );
                await run(
                    `UPDATE event_seats SET status = 'AVAILABLE' WHERE id = ? AND status = 'HELD'`,
                    [sId]
                );
            }
        });

        emitSeatStatusChange(eventId, seatIds, 'AVAILABLE', userId);

        res.json({ message: 'Seats released successfully' });
    } catch (err) {
        console.error('Seat release error:', err);
        res.status(500).json({ error: 'Failed to release seats' });
    }
});

module.exports = router;
