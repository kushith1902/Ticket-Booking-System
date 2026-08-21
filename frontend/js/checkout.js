import { api } from './api.js';
import { formatCurrency, formatDate, formatTime } from './utils.js';
import { showToast } from './toast.js';

let timerInterval = null;

export async function initCheckout() {
    const checkoutDataRaw = sessionStorage.getItem('ticketflow_checkout');
    if (!checkoutDataRaw) {
        showToast('No active seat hold session found.', 'error');
        setTimeout(() => window.location.href = '/events.html', 1500);
        return;
    }

    const checkoutData = JSON.parse(checkoutDataRaw);
    const { eventId, seatIds, holdToken, expiresAt } = checkoutData;

    try {
        const eventRes = await api.getEventDetails(eventId);
        const seatsRes = await api.getSeats(eventId);

        const event = eventRes.event;
        const selectedSeats = seatsRes.seats.filter(s => seatIds.includes(s.id));

        // Render Event & Seats Breakdown
        const eventInfoEl = document.getElementById('checkout-event-info');
        if (eventInfoEl) {
            eventInfoEl.innerHTML = `
                <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 20px;">
                    <img src="${event.poster_url}" alt="${event.title}" style="width: 80px; height: 110px; object-fit: cover; border-radius: var(--radius-sm);" />
                    <div>
                        <h2 style="font-size: 1.3rem; margin-bottom: 4px;">${event.title}</h2>
                        <p style="color: var(--text-muted); font-size: 0.9rem;">📍 ${event.venue_name}, ${event.venue_location}</p>
                        <p style="color: var(--text-secondary); font-size: 0.9rem;">📅 ${formatDate(event.start_date)} • ⏰ ${formatTime(event.start_date)}</p>
                    </div>
                </div>
            `;
        }

        // Render Price Breakdown
        const subtotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);
        const bookingFee = 150;
        const tax = Math.round(subtotal * 0.05);
        const total = subtotal + bookingFee + tax;

        const breakdownEl = document.getElementById('price-breakdown');
        if (breakdownEl) {
            breakdownEl.innerHTML = `
                <div class="summary-row">
                    <span>Seats (${selectedSeats.map(s => `${s.row_label}${s.seat_number}`).join(', ')})</span>
                    <span>${formatCurrency(subtotal)}</span>
                </div>
                <div class="summary-row">
                    <span>Booking Convenience Fee</span>
                    <span>${formatCurrency(bookingFee)}</span>
                </div>
                <div class="summary-row">
                    <span>Estimated Tax (5% GST)</span>
                    <span>${formatCurrency(tax)}</span>
                </div>
                <div class="summary-total summary-row">
                    <span>Total Amount</span>
                    <span style="color: var(--accent-primary);">${formatCurrency(total)}</span>
                </div>
            `;
        }

        // Start Countdown Timer
        startCountdownTimer(expiresAt);

        // Confirm Order Action
        const confirmBtn = document.getElementById('confirm-booking-btn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'card';

                try {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = 'Processing booking...';

                    const bookingRes = await api.createBooking({
                        eventId,
                        seatIds,
                        holdToken,
                        paymentMethod
                    });

                    showToast('Booking confirmed successfully!', 'success');
                    sessionStorage.removeItem('ticketflow_checkout');

                    setTimeout(() => {
                        window.location.href = `/booking-success.html?id=${bookingRes.booking.id}`;
                    }, 500);

                } catch (err) {
                    showToast(err.message, 'error');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm & Pay Now';
                }
            };
        }

    } catch (err) {
        showToast('Failed to load checkout details: ' + err.message, 'error');
    }
}

function startCountdownTimer(expiresAtStr) {
    const timerDisplay = document.getElementById('countdown-timer');
    if (!timerDisplay) return;

    const expiresAtMs = new Date(expiresAtStr.replace(' ', 'T')).getTime();

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const now = Date.now();
        const diff = expiresAtMs - now;

        if (diff <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = '00:00';
            showToast('Your seat hold timer has expired!', 'error');
            setTimeout(() => window.location.href = '/events.html', 2000);
            return;
        }

        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
}
