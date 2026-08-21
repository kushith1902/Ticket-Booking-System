import { api } from './api.js';
import { formatCurrency, formatDate, formatTime } from './utils.js';
import { showToast } from './toast.js';

export async function loadBookings() {
    const listEl = document.getElementById('bookings-list');
    if (!listEl) return;

    listEl.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading booking history...</div>`;

    try {
        const data = await api.getBookings();
        const bookings = data.bookings;

        if (!bookings || bookings.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
                    <h3 style="margin-bottom: 8px;">No bookings found</h3>
                    <p style="color: var(--text-muted);">Explore events and book your tickets today!</p>
                    <a href="/events.html" class="btn btn-primary" style="margin-top: 16px;">Browse Events</a>
                </div>
            `;
            return;
        }

        listEl.innerHTML = bookings.map(b => {
            const isConfirmed = b.status === 'CONFIRMED';
            return `
                <div class="card" style="padding: 24px; margin-bottom: 20px; display: flex; flex-direction: row; gap: 20px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; gap: 16px; align-items: center;">
                        <img src="${b.poster_url}" alt="${b.event_title}" style="width: 70px; height: 95px; object-fit: cover; border-radius: var(--radius-sm);" />
                        <div>
                            <div class="badge ${isConfirmed ? 'badge-available' : 'badge-soldout'}" style="margin-bottom: 6px;">${b.status}</div>
                            <h3 style="font-size: 1.15rem; margin-bottom: 4px;">${b.event_title}</h3>
                            <p style="font-size: 0.85rem; color: var(--text-muted);">📍 ${b.venue_name}</p>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">📅 ${formatDate(b.start_date)} • ⏰ ${formatTime(b.start_date)}</p>
                            <p style="font-size: 0.9rem; font-weight: 700; color: var(--accent-primary); margin-top: 4px;">Seats: ${b.seatLabels.join(', ')}</p>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 12px;">
                        <div style="text-align: right;">
                            <div style="font-size: 0.75rem; color: var(--text-muted);">BOOKING REF</div>
                            <div style="font-family: monospace; font-size: 1.1rem; font-weight: 800; color: #fff;">${b.booking_ref}</div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">${formatCurrency(b.total_amount)}</div>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            ${isConfirmed ? `
                                <a href="/ticket.html?id=${b.id}" class="btn btn-primary" style="padding: 8px 16px; font-size: 0.85rem;">View Digital Ticket</a>
                                <button class="btn btn-secondary cancel-booking-btn" data-id="${b.id}" style="padding: 8px 16px; font-size: 0.85rem; color: #ef4444;">Cancel</button>
                            ` : `<span style="font-size: 0.85rem; color: var(--text-muted);">Cancelled</span>`}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach Cancellation Handlers
        listEl.querySelectorAll('.cancel-booking-btn').forEach(btn => {
            btn.onclick = async () => {
                const bId = btn.dataset.id;
                if (confirm('Are you sure you want to cancel this booking? Refund will be issued as per cancellation rules.')) {
                    try {
                        btn.disabled = true;
                        btn.textContent = 'Cancelling...';
                        await api.cancelBooking(bId);
                        showToast('Booking cancelled successfully', 'success');
                        loadBookings();
                    } catch (err) {
                        showToast(err.message, 'error');
                        btn.disabled = false;
                        btn.textContent = 'Cancel';
                    }
                }
            };
        });

    } catch (err) {
        listEl.innerHTML = `<div style="padding: 40px; color: #ef4444;">Failed to load bookings: ${err.message}</div>`;
    }
}
