const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { query, get, run, transaction } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { emitSeatStatusChange } = require('../websocket/socketHandler');
const { sendBookingConfirmationEmail } = require('../services/emailService');
const { processWaitlistForSeat } = require('../jobs/ttlWorker');

// POST /api/bookings - Transactional Booking Checkout
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { eventId, seatIds, holdToken, paymentMethod } = req.body;
        const userId = req.user.id;

        if (!eventId || !Array.isArray(seatIds) || seatIds.length === 0) {
            return res.status(400).json({ error: 'Event ID and seat IDs are required' });
        }

        const user = await get('SELECT name, email FROM users WHERE id = ?', [userId]);
        const event = await get(
            `SELECT e.*, v.name as venue_name FROM events e JOIN venues v ON e.venue_id = v.id WHERE e.id = ?`,
            [eventId]
        );

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const now = new Date().toISOString();

        // Perform transactional booking checkout
        const bookingResult = await transaction(async () => {
            // Verify holds for all requested seats
            let subtotal = 0;
            const seatLabels = [];
            const seatCategories = [];

            for (const sId of seatIds) {
                const seat = await get(`SELECT * FROM event_seats WHERE id = ? AND event_id = ?`, [sId, eventId]);

                if (!seat) {
                    throw new Error(`Seat ID ${sId} not found.`);
                }

                // Check active hold
                const hold = await get(
                    `SELECT * FROM seat_holds
                     WHERE event_id = ? AND seat_id = ? AND user_id = ? AND status = 'ACTIVE' AND datetime(expires_at) > datetime(?)`,
                    [eventId, sId, userId, now]
                );

                if (!hold && seat.status !== 'AVAILABLE') {
                    throw new Error(`Reservation for seat ${seat.row_label}${seat.seat_number} has expired or is invalid.`);
                }

                subtotal += seat.price;
                seatLabels.push(`${seat.row_label}${seat.seat_number}`);
                seatCategories.push({ id: seat.id, category: seat.category, label: `${seat.row_label}${seat.seat_number}` });
            }

            const bookingFee = 150;
            const tax = Math.round(subtotal * 0.05); // 5% GST/Tax
            const totalAmount = subtotal + bookingFee + tax;

            // Generate unique Booking Reference
            const bookingRef = 'BK-2026-' + crypto.randomBytes(3).toString('hex').toUpperCase();

            // Create booking record
            const resBooking = await run(
                `INSERT INTO bookings (booking_ref, user_id, event_id, total_amount, booking_fee, tax, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED')`,
                [bookingRef, userId, eventId, totalAmount, bookingFee, tax]
            );
            const bookingId = resBooking.lastID;

            // Create booking seats & update seat status to BOOKED & consume holds
            for (const sId of seatIds) {
                const seat = await get(`SELECT price FROM event_seats WHERE id = ?`, [sId]);
                await run(`INSERT INTO booking_seats (booking_id, seat_id, price) VALUES (?, ?, ?)`, [bookingId, sId, seat.price]);
                await run(`UPDATE event_seats SET status = 'BOOKED' WHERE id = ?`, [sId]);
                await run(`UPDATE seat_holds SET status = 'CONSUMED' WHERE seat_id = ? AND user_id = ? AND status = 'ACTIVE'`, [sId, userId]);
            }

            // Create notification
            await run(
                `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'booking')`,
                [
                    userId,
                    '🎟 Booking Confirmed!',
                    `Your booking (${bookingRef}) for ${event.title} has been confirmed.`
                ]
            );

            return {
                bookingId,
                bookingRef,
                totalAmount,
                subtotal,
                bookingFee,
                tax,
                seatLabels,
                seatCategories
            };
        });

        // Generate QR Code Data URL
        let qrDataUrl = '';
        try {
            qrDataUrl = await QRCode.toDataURL(bookingResult.bookingRef, { width: 250, margin: 2 });
        } catch (qrErr) {
            console.error('QR generation error:', qrErr);
        }

        // Broadcast real-time Socket.IO update
        emitSeatStatusChange(eventId, seatIds, 'BOOKED', userId);

        // Send email receipt asynchronously
        sendBookingConfirmationEmail({
            userEmail: user.email,
            userName: user.name,
            bookingRef: bookingResult.bookingRef,
            eventTitle: event.title,
            venueName: event.venue_name,
            startDate: event.start_date,
            seats: bookingResult.seatLabels,
            totalAmount: bookingResult.totalAmount,
            qrDataUrl
        }).catch((e) => console.error('Email background send error:', e));

        res.status(201).json({
            message: 'Booking confirmed successfully!',
            booking: {
                id: bookingResult.bookingId,
                bookingRef: bookingResult.bookingRef,
                eventId,
                eventTitle: event.title,
                venueName: event.venue_name,
                startDate: event.start_date,
                seats: bookingResult.seatLabels,
                totalAmount: bookingResult.totalAmount,
                qrDataUrl
            }
        });
    } catch (err) {
        console.error('Booking checkout error:', err.message);
        res.status(400).json({ error: err.message || 'Failed to complete booking checkout' });
    }
});

// GET /api/bookings - Get user booking history
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const bookings = await query(
            `SELECT b.*, e.title as event_title, e.poster_url, e.start_date, v.name as venue_name
             FROM bookings b
             JOIN events e ON b.event_id = e.id
             JOIN venues v ON e.venue_id = v.id
             WHERE b.user_id = ?
             ORDER BY b.created_at DESC`,
            [userId]
        );

        for (const b of bookings) {
            const seats = await query(
                `SELECT es.row_label, es.seat_number, es.category, bs.price
                 FROM booking_seats bs
                 JOIN event_seats es ON bs.seat_id = es.id
                 WHERE bs.booking_id = ?`,
                [b.id]
            );
            b.seats = seats;
            b.seatLabels = seats.map(s => `${s.row_label}${s.seat_number}`);
        }

        res.json({ bookings });
    } catch (err) {
        console.error('Error fetching bookings:', err);
        res.status(500).json({ error: 'Failed to retrieve booking history' });
    }
});

// GET /api/bookings/:id - Single booking / ticket view
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const userId = req.user.id;

        const booking = await get(
            `SELECT b.*, e.title as event_title, e.event_type, e.poster_url, e.start_date, e.duration_mins,
                    v.name as venue_name, v.address as venue_address, u.name as customer_name, u.email as customer_email
             FROM bookings b
             JOIN events e ON b.event_id = e.id
             JOIN venues v ON e.venue_id = v.id
             JOIN users u ON b.user_id = u.id
             WHERE (b.id = ? OR b.booking_ref = ?) AND (b.user_id = ? OR ? = 'admin')`,
            [bookingId, bookingId, userId, req.user.role]
        );

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found or unauthorized' });
        }

        const seats = await query(
            `SELECT es.id as seat_id, es.row_label, es.seat_number, es.category, bs.price
             FROM booking_seats bs
             JOIN event_seats es ON bs.seat_id = es.id
             WHERE bs.booking_id = ?`,
            [booking.id]
        );

        booking.seats = seats;
        booking.seatLabels = seats.map(s => `${s.row_label}${s.seat_number}`);

        // Generate QR code Data URL
        booking.qrDataUrl = await QRCode.toDataURL(booking.booking_ref, { width: 260, margin: 2 });

        res.json({ booking });
    } catch (err) {
        console.error('Error fetching ticket:', err);
        res.status(500).json({ error: 'Failed to retrieve ticket' });
    }
});

// POST /api/bookings/:id/cancel - Cancel booking
router.post('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const userId = req.user.id;

        const booking = await get(`SELECT * FROM bookings WHERE id = ? AND user_id = ?`, [bookingId, userId]);
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found or not eligible for cancellation' });
        }

        if (booking.status === 'CANCELLED') {
            return res.status(400).json({ error: 'Booking is already cancelled' });
        }

        const bookingSeats = await query(
            `SELECT bs.seat_id, es.category, es.row_label, es.seat_number, es.event_id
             FROM booking_seats bs
             JOIN event_seats es ON bs.seat_id = es.id
             WHERE bs.booking_id = ?`,
            [bookingId]
        );

        await transaction(async () => {
            // Update booking status
            await run(`UPDATE bookings SET status = 'CANCELLED' WHERE id = ?`, [bookingId]);

            // Release seats back to AVAILABLE
            for (const bs of bookingSeats) {
                await run(`UPDATE event_seats SET status = 'AVAILABLE' WHERE id = ?`, [bs.seat_id]);
            }

            // Notification
            await run(
                `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'cancellation')`,
                [
                    userId,
                    'Booking Cancelled',
                    `Your booking ${booking.booking_ref} has been cancelled successfully.`
                ]
            );
        });

        const seatIds = bookingSeats.map(bs => bs.seat_id);
        emitSeatStatusChange(booking.event_id, seatIds, 'AVAILABLE', userId);

        // Asynchronously check if waitlist customers need these newly freed seats!
        for (const bs of bookingSeats) {
            processWaitlistForSeat(bs.event_id, bs.seat_id, bs.category, `${bs.row_label}${bs.seat_number}`).catch(e => console.error(e));
        }

        res.json({ message: 'Booking cancelled successfully. Seats have been returned to inventory.' });
    } catch (err) {
        console.error('Cancellation error:', err);
        res.status(500).json({ error: 'Failed to cancel booking' });
    }
});

module.exports = router;
