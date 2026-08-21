const express = require('express');
const router = express.Router();
const { query, get, run } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/organiser/dashboard - Metrics calculation for Organisers
router.get('/organiser/dashboard', authenticateToken, requireRole('organiser', 'admin'), async (req, res) => {
    try {
        const organiserId = req.user.id;

        // Organiser Events
        const events = await query(
            `SELECT e.*, v.name as venue_name,
                    (SELECT COUNT(*) FROM event_seats es WHERE es.event_id = e.id) as total_seats,
                    (SELECT COUNT(*) FROM event_seats es WHERE es.event_id = e.id AND es.status = 'BOOKED') as booked_seats,
                    (SELECT COALESCE(SUM(total_amount), 0) FROM bookings b WHERE b.event_id = e.id AND b.status = 'CONFIRMED') as revenue
             FROM events e
             JOIN venues v ON e.venue_id = v.id
             WHERE e.organiser_id = ? OR ? = 'admin'
             ORDER BY e.created_at DESC`,
            [organiserId, req.user.role]
        );

        const totalRevenueRow = await get(
            `SELECT COALESCE(SUM(b.total_amount), 0) as total
             FROM bookings b
             JOIN events e ON b.event_id = e.id
             WHERE (e.organiser_id = ? OR ? = 'admin') AND b.status = 'CONFIRMED'`,
            [organiserId, req.user.role]
        );

        const ticketsSoldRow = await get(
            `SELECT COUNT(*) as count
             FROM booking_seats bs
             JOIN bookings b ON bs.booking_id = b.id
             JOIN events e ON b.event_id = e.id
             WHERE (e.organiser_id = ? OR ? = 'admin') AND b.status = 'CONFIRMED'`,
            [organiserId, req.user.role]
        );

        const totalCapacityRow = await get(
            `SELECT COUNT(*) as count
             FROM event_seats es
             JOIN events e ON es.event_id = e.id
             WHERE (e.organiser_id = ? OR ? = 'admin')`,
            [organiserId, req.user.role]
        );

        const totalCapacity = totalCapacityRow.count || 1;
        const ticketsSold = ticketsSoldRow.count || 0;
        const occupancyRate = Math.round((ticketsSold / totalCapacity) * 100);

        const waitlistCountRow = await get(
            `SELECT COUNT(*) as count
             FROM waitlist_entries we
             JOIN events e ON we.event_id = e.id
             WHERE (e.organiser_id = ? OR ? = 'admin') AND we.status = 'WAITING'`,
            [organiserId, req.user.role]
        );

        res.json({
            metrics: {
                totalRevenue: totalRevenueRow.total,
                ticketsSold,
                occupancyRate,
                upcomingEvents: events.length,
                waitlistRequests: waitlistCountRow.count
            },
            events
        });
    } catch (err) {
        console.error('Organiser dashboard error:', err);
        res.status(500).json({ error: 'Failed to fetch organiser dashboard metrics' });
    }
});

// GET /api/admin/dashboard - Metrics & tables for Platform Admin
router.get('/admin/dashboard', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const totalUsers = (await get(`SELECT COUNT(*) as count FROM users WHERE role = 'customer'`)).count;
        const totalOrganisers = (await get(`SELECT COUNT(*) as count FROM users WHERE role = 'organiser'`)).count;
        const totalVenues = (await get(`SELECT COUNT(*) as count FROM venues`)).count;
        const activeEvents = (await get(`SELECT COUNT(*) as count FROM events WHERE status = 'published'`)).count;
        const totalBookings = (await get(`SELECT COUNT(*) as count FROM bookings WHERE status = 'CONFIRMED'`)).count;
        const platformRevenue = (await get(`SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE status = 'CONFIRMED'`)).total;
        const activeHolds = (await get(`SELECT COUNT(*) as count FROM seat_holds WHERE status = 'ACTIVE' AND datetime(expires_at) > datetime('now')`)).count;
        const activeOffers = (await get(`SELECT COUNT(*) as count FROM waitlist_offers WHERE status = 'PENDING' AND datetime(expires_at) > datetime('now')`)).count;

        const usersList = await query(`SELECT id, name, email, role, phone, created_at FROM users ORDER BY created_at DESC LIMIT 50`);

        res.json({
            metrics: {
                totalUsers,
                totalOrganisers,
                totalVenues,
                activeEvents,
                totalBookings,
                platformRevenue,
                activeHolds,
                activeOffers
            },
            usersList
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).json({ error: 'Failed to fetch admin metrics' });
    }
});

// GET /api/notifications - User notifications
router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await query(
            `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
            [req.user.id]
        );
        const unreadCount = (await get(`SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`, [req.user.id])).count;
        res.json({ notifications, unreadCount });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// PUT /api/notifications/read - Mark notifications read
router.put('/notifications/read', authenticateToken, async (req, res) => {
    try {
        await run(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [req.user.id]);
        res.json({ message: 'Notifications marked as read' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

module.exports = router;
