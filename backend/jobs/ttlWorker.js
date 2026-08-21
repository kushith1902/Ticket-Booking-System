const { query, run, get, transaction } = require('../database/db');
const { emitSeatStatusChange, emitWaitlistOffer } = require('../websocket/socketHandler');
const { sendWaitlistOfferEmail } = require('../services/emailService');
const crypto = require('crypto');

let isProcessing = false;

async function processExpiredHolds() {
    try {
        const now = new Date().toISOString();
        // 1. Find active holds that have passed expiration
        const expiredHolds = await query(
            `SELECT sh.*, es.event_id, es.row_label, es.seat_number, es.category
             FROM seat_holds sh
             JOIN event_seats es ON sh.seat_id = es.id
             WHERE sh.status = 'ACTIVE' AND datetime(sh.expires_at) <= datetime(?)`,
            [now]
        );

        if (expiredHolds.length > 0) {
            console.log(`[TTL Worker] Found ${expiredHolds.length} expired seat holds to release.`);

            for (const hold of expiredHolds) {
                await transaction(async () => {
                    // Update hold status
                    await run(`UPDATE seat_holds SET status = 'EXPIRED' WHERE id = ?`, [hold.id]);
                    // Release seat back to AVAILABLE
                    await run(`UPDATE event_seats SET status = 'AVAILABLE' WHERE id = ? AND status = 'HELD'`, [hold.seat_id]);
                });

                // Broadcast WS update
                emitSeatStatusChange(hold.event_id, [hold.seat_id], 'AVAILABLE');
                console.log(`[TTL Worker] Released seat ID #${hold.seat_id} (${hold.row_label}${hold.seat_number}) for event #${hold.event_id}`);

                // Try to trigger waitlist matching for this category
                await processWaitlistForSeat(hold.event_id, hold.seat_id, hold.category, `${hold.row_label}${hold.seat_number}`);
            }
        }
    } catch (err) {
        console.error('[TTL Worker] Error processing expired holds:', err.message);
    }
}

async function processExpiredWaitlistOffers() {
    try {
        const now = new Date().toISOString();
        const expiredOffers = await query(
            `SELECT wo.*, es.category, es.row_label, es.seat_number
             FROM waitlist_offers wo
             JOIN event_seats es ON wo.seat_id = es.id
             WHERE wo.status = 'PENDING' AND datetime(wo.expires_at) <= datetime(?)`,
            [now]
        );

        if (expiredOffers.length > 0) {
            console.log(`[TTL Worker] Found ${expiredOffers.length} expired waitlist offers.`);

            for (const offer of expiredOffers) {
                await transaction(async () => {
                    // Mark offer as EXPIRED
                    await run(`UPDATE waitlist_offers SET status = 'EXPIRED' WHERE id = ?`, [offer.id]);
                    // Mark waitlist entry as EXPIRED
                    await run(`UPDATE waitlist_entries SET status = 'EXPIRED' WHERE id = ?`, [offer.waitlist_id]);
                    // Release seat back to AVAILABLE
                    await run(`UPDATE event_seats SET status = 'AVAILABLE' WHERE id = ? AND status = 'HELD'`, [offer.seat_id]);
                });

                emitSeatStatusChange(offer.event_id, [offer.seat_id], 'AVAILABLE');
                console.log(`[TTL Worker] Expired waitlist offer #${offer.id} for user #${offer.user_id}`);

                // Check next customer in line for this seat/category
                await processWaitlistForSeat(offer.event_id, offer.seat_id, offer.category, `${offer.row_label}${offer.seat_number}`);
            }
        }
    } catch (err) {
        console.error('[TTL Worker] Error processing waitlist offers:', err.message);
    }
}

async function processWaitlistForSeat(eventId, seatId, category, seatLabel) {
    try {
        // Find top customer waiting in FIFO queue for this event & category
        const nextInLine = await get(
            `SELECT we.*, u.email, u.name as user_name, e.title as event_title
             FROM waitlist_entries we
             JOIN users u ON we.user_id = u.id
             JOIN events e ON we.event_id = e.id
             WHERE we.event_id = ? AND we.category = ? AND we.status = 'WAITING'
             ORDER BY we.position ASC, we.created_at ASC
             LIMIT 1`,
            [eventId, category]
        );

        if (!nextInLine) return; // Nobody on waitlist for this category

        // Ensure seat is still AVAILABLE
        const seat = await get(`SELECT id, status FROM event_seats WHERE id = ? AND status = 'AVAILABLE'`, [seatId]);
        if (!seat) return;

        const offerTTL = parseInt(process.env.WAITLIST_TTL_MINUTES || '10', 10);
        const expiresAtDate = new Date(Date.now() + offerTTL * 60 * 1000);
        const expiresAtStr = expiresAtDate.toISOString().replace('T', ' ').substring(0, 19);
        const offerToken = 'WOF-' + crypto.randomBytes(8).toString('hex').toUpperCase();

        await transaction(async () => {
            // Reserve seat as HELD for waitlist offer
            await run(`UPDATE event_seats SET status = 'HELD' WHERE id = ?`, [seatId]);

            // Update waitlist entry status
            await run(`UPDATE waitlist_entries SET status = 'OFFERED' WHERE id = ?`, [nextInLine.id]);

            // Create waitlist offer record
            await run(
                `INSERT INTO waitlist_offers (waitlist_id, event_id, seat_id, user_id, offer_token, expires_at, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
                [nextInLine.id, eventId, seatId, nextInLine.user_id, offerToken, expiresAtStr]
            );

            // Add notification
            await run(
                `INSERT INTO notifications (user_id, title, message, type)
                 VALUES (?, ?, ?, ?)`,
                [
                    nextInLine.user_id,
                    '🎟 Waitlist Offer Available!',
                    `A ${category} seat (${seatLabel}) is available for ${nextInLine.event_title}! Claim it before ${expiresAtStr}.`,
                    'waitlist_offer'
                ]
            );
        });

        // Broadcast seat map update
        emitSeatStatusChange(eventId, [seatId], 'HELD');

        // Emit targeted websocket alert to user
        const offerClaimUrl = `http://localhost:3000/waitlist.html?offer=${offerToken}`;
        emitWaitlistOffer(nextInLine.user_id, {
            offerToken,
            eventTitle: nextInLine.event_title,
            category,
            seatLabel,
            expiresAt: expiresAtStr,
            claimUrl: offerClaimUrl
        });

        // Send Email notification
        await sendWaitlistOfferEmail({
            userEmail: nextInLine.email,
            userName: nextInLine.user_name,
            eventTitle: nextInLine.event_title,
            category,
            seatLabel,
            claimUrl: offerClaimUrl,
            expiresAt: expiresAtStr
        });

        console.log(`[TTL Worker] Created waitlist offer token ${offerToken} for user ${nextInLine.email} on seat ${seatLabel}`);
    } catch (err) {
        console.error('[TTL Worker] Error processing waitlist for seat:', err.message);
    }
}

function startTTLWorker() {
    console.log('Background TTL Worker started (scanning holds & waitlists every 3 seconds).');
    setInterval(async () => {
        if (isProcessing) return;
        isProcessing = true;
        await processExpiredHolds();
        await processExpiredWaitlistOffers();
        isProcessing = false;
    }, 3000);
}

module.exports = {
    startTTLWorker,
    processWaitlistForSeat
};
