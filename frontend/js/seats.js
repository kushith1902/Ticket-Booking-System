import { api } from './api.js';
import { initWebSocket } from './websocket.js';
import { formatCurrency } from './utils.js';
import { showToast } from './toast.js';

let selectedSeatIds = [];
let eventData = null;
let seatsList = [];

export async function initSeatSelection(eventId) {
    const mapContainer = document.getElementById('seat-map-container');
    const summaryPanel = document.getElementById('summary-panel');

    if (!mapContainer) return;

    mapContainer.innerHTML = `<div style="padding: 40px; color: var(--text-muted);">Loading interactive seat map...</div>`;

    try {
        const data = await api.getSeats(eventId);
        eventData = data.event;
        seatsList = data.seats;

        // Render Page Info Header
        const titleEl = document.getElementById('event-title');
        if (titleEl) titleEl.textContent = eventData.title;

        renderSeatMap();
        updateSummary();

        // Connect WebSockets for real-time seat lock synchronization across concurrent users
        initWebSocket(eventId, (update) => {
            // console.log('Real-time seat update received:', update);
            if (update.eventId == eventId && Array.isArray(update.seatIds)) {
                update.seatIds.forEach(sId => {
                    const seatObj = seatsList.find(s => s.id == sId);
                    if (seatObj) {
                        seatObj.status = update.status;
                        // If seat was selected by current user and another user held/booked it, unselect
                        if (update.status !== 'AVAILABLE' && update.userId != getCurrentUserId()) {
                            selectedSeatIds = selectedSeatIds.filter(id => id != sId);
                        }
                    }
                });
                renderSeatMap();
                updateSummary();
            }
        });

    } catch (err) {
        mapContainer.innerHTML = `<div style="padding: 40px; color: #ef4444;">Failed to load seat map: ${err.message}</div>`;
    }
}

function getCurrentUserId() {
    try {
        return JSON.parse(localStorage.getItem('ticketflow_user')).id;
    } catch (e) {
        return null;
    }
}

function renderSeatMap() {
    const mapContainer = document.getElementById('seat-map-container');
    if (!mapContainer) return;

    // Group seats by row_label
    const rowsMap = {};
    seatsList.forEach(s => {
        if (!rowsMap[s.row_label]) rowsMap[s.row_label] = [];
        rowsMap[s.row_label].push(s);
    });

    let html = `
        <div class="seat-map-wrapper">
            <div class="cinema-screen"></div>
            <div class="screen-text">SCREEN THIS WAY</div>

            <div class="seats-grid">
    `;

    Object.keys(rowsMap).sort().forEach(rowLabel => {
        html += `
            <div class="seat-row">
                <div class="row-label">${rowLabel}</div>
                <div class="seat-row-seats">
        `;

        rowsMap[rowLabel].sort((a, b) => a.seat_number - b.seat_number).forEach(seat => {
            const isSelected = selectedSeatIds.includes(seat.id);
            let displayStatus = seat.status;
            if (isSelected) displayStatus = 'SELECTED';

            const categoryClass = `category-${seat.category}`;
            const statusClass = `status-${displayStatus}`;

            html += `
                <div class="seat ${categoryClass} ${statusClass}"
                     data-id="${seat.id}"
                     data-label="${seat.row_label}${seat.seat_number}"
                     data-category="${seat.category}"
                     data-price="${seat.price}"
                     data-status="${seat.status}"
                     title="${seat.row_label}${seat.seat_number} - ${seat.category} (${formatCurrency(seat.price)})">
                    ${seat.seat_number}
                </div>
            `;
        });

        html += `
                </div>
                <div class="row-label">${rowLabel}</div>
            </div>
        `;
    });

    html += `
            </div>

            <div class="seat-legend">
                <div class="legend-item"><div class="legend-dot" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981;"></div> Available</div>
                <div class="legend-item"><div class="legend-dot" style="background: #3b82f6;"></div> Selected</div>
                <div class="legend-item"><div class="legend-dot" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b;"></div> Held</div>
                <div class="legend-item"><div class="legend-dot" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444;"></div> Booked</div>
            </div>
        </div>
    `;

    mapContainer.innerHTML = html;

    // Attach click listeners to available seats
    mapContainer.querySelectorAll('.seat').forEach(seatEl => {
        seatEl.addEventListener('click', () => {
            const seatId = parseInt(seatEl.dataset.id, 10);
            const status = seatEl.dataset.status;

            if (status !== 'AVAILABLE') {
                showToast(`Seat ${seatEl.dataset.label} is unavailable (${status})`, 'warning');
                return;
            }

            if (selectedSeatIds.includes(seatId)) {
                selectedSeatIds = selectedSeatIds.filter(id => id !== seatId);
            } else {
                if (selectedSeatIds.length >= 6) {
                    showToast('Maximum 6 seats allowed per booking', 'warning');
                    return;
                }
                selectedSeatIds.push(seatId);
            }

            renderSeatMap();
            updateSummary();
        });
    });
}

function updateSummary() {
    const selectedListEl = document.getElementById('selected-seats-list');
    const totalEl = document.getElementById('summary-total-price');
    const continueBtn = document.getElementById('continue-checkout-btn');

    if (!selectedListEl || !totalEl || !continueBtn) return;

    if (selectedSeatIds.length === 0) {
        selectedListEl.innerHTML = `<span style="color: var(--text-muted);">No seats selected</span>`;
        totalEl.textContent = formatCurrency(0);
        continueBtn.disabled = true;
        return;
    }

    const selectedSeats = seatsList.filter(s => selectedSeatIds.includes(s.id));
    const subtotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);

    selectedListEl.innerHTML = selectedSeats.map(s => `
        <div class="summary-row">
            <span>Seat <strong>${s.row_label}${s.seat_number}</strong> (${s.category})</span>
            <span>${formatCurrency(s.price)}</span>
        </div>
    `).join('');

    totalEl.textContent = formatCurrency(subtotal);
    continueBtn.disabled = false;

    // Attach Continue Button Action -> Executes Atomic Server Hold
    continueBtn.onclick = async () => {
        const user = localStorage.getItem('ticketflow_user');
        if (!user) {
            showToast('Please log in to proceed to checkout', 'warning');
            setTimeout(() => window.location.href = `/login.html?redirect=/seat-selection.html?id=${eventData.id}`, 1000);
            return;
        }

        try {
            continueBtn.disabled = true;
            continueBtn.textContent = 'Reserving seats...';

            const holdData = await api.holdSeats(eventData.id, selectedSeatIds);
            showToast('Seats reserved for 10 minutes!', 'success');

            // Store hold details in session storage for checkout page
            sessionStorage.setItem('ticketflow_checkout', JSON.stringify({
                eventId: eventData.id,
                seatIds: selectedSeatIds,
                holdToken: holdData.holdToken,
                expiresAt: holdData.expiresAt
            }));

            setTimeout(() => {
                window.location.href = `/checkout.html?event=${eventData.id}`;
            }, 500);

        } catch (err) {
            showToast(err.message, 'error');
            continueBtn.disabled = false;
            continueBtn.textContent = 'Continue to Checkout';
        }
    };
}
