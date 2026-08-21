import { api } from './api.js';
import { formatCurrency, formatDate } from './utils.js';
import { showToast } from './toast.js';

export async function initAdminDashboard() {
    const metricsEl = document.getElementById('admin-metrics');
    const usersTableEl = document.getElementById('admin-users-body');

    if (!metricsEl) return;

    try {
        const data = await api.getAdminDashboard();
        const { metrics, usersList } = data;

        metricsEl.innerHTML = `
            <div class="metric-card">
                <div class="metric-title">Platform Revenue</div>
                <div class="metric-value" style="color: var(--accent-primary);">${formatCurrency(metrics.platformRevenue)}</div>
                <div class="metric-sub">Total Gross Sales</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Total Customers</div>
                <div class="metric-value">${metrics.totalUsers}</div>
                <div class="metric-sub">Registered Users</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Active Events</div>
                <div class="metric-value" style="color: var(--accent-secondary);">${metrics.activeEvents}</div>
                <div class="metric-sub">Published Events</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Active Seat Holds</div>
                <div class="metric-value" style="color: #f59e0b;">${metrics.activeHolds}</div>
                <div class="metric-sub">Live 10-Min Locks</div>
            </div>
        `;

        if (usersTableEl && usersList) {
            usersTableEl.innerHTML = usersList.map(u => `
                <tr>
                    <td><strong>${u.name}</strong></td>
                    <td>${u.email}</td>
                    <td><span class="badge ${u.role === 'admin' ? 'badge-concert' : u.role === 'organiser' ? 'badge-movie' : 'badge-available'}">${u.role}</span></td>
                    <td>${u.phone || 'N/A'}</td>
                    <td>${formatDate(u.created_at)}</td>
                </tr>
            `).join('');
        }

    } catch (err) {
        showToast('Failed to load admin metrics: ' + err.message, 'error');
    }
}

// Visual Venue Builder Seating Layout Canvas Logic
export function initVenueBuilder() {
    const builderCanvas = document.getElementById('builder-canvas');
    const rowsInput = document.getElementById('builder-rows');
    const seatsPerRowInput = document.getElementById('builder-seats-per-row');
    const generateBtn = document.getElementById('generate-layout-btn');
    const saveVenueBtn = document.getElementById('save-venue-btn');

    if (!builderCanvas || !generateBtn || !saveVenueBtn) return;

    let layoutSeats = [];

    function generateGrid() {
        const rows = parseInt(rowsInput.value || '5', 10);
        const seatsPerRow = parseInt(seatsPerRowInput.value || '8', 10);
        const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

        layoutSeats = [];
        let html = `<div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">`;

        for (let r = 0; r < Math.min(rows, rowLabels.length); r++) {
            const label = rowLabels[r];
            let cat = 'Standard';
            if (r === 0) cat = 'VIP';
            else if (r === 1) cat = 'Premium';
            else if (r >= rows - 2) cat = 'Economy';

            html += `<div style="display: flex; gap: 10px; align-items: center;">
                        <span style="width: 24px; font-weight: bold; color: var(--text-muted);">${label}</span>`;

            for (let s = 1; s <= seatsPerRow; s++) {
                const sObj = { rowLabel: label, seatNumber: s, category: cat, status: 'active', posX: (s-1)*45, posY: r*45 };
                layoutSeats.push(sObj);

                html += `
                    <div class="seat category-${cat} status-AVAILABLE builder-seat-item"
                         data-row="${label}" data-num="${s}"
                         style="width: 36px; height: 36px;"
                         title="Click to cycle category (${cat})">
                        ${s}
                    </div>
                `;
            }

            html += `<span style="width: 24px; font-weight: bold; color: var(--text-muted);">${label}</span></div>`;
        }

        html += `</div>`;
        builderCanvas.innerHTML = html;

        // Toggle category cycle on click
        builderCanvas.querySelectorAll('.builder-seat-item').forEach((seatEl, idx) => {
            seatEl.addEventListener('click', () => {
                const cats = ['VIP', 'Premium', 'Standard', 'Economy'];
                const curCat = layoutSeats[idx].category;
                const nextCat = cats[(cats.indexOf(curCat) + 1) % cats.length];
                layoutSeats[idx].category = nextCat;

                seatEl.className = `seat category-${nextCat} status-AVAILABLE builder-seat-item`;
                seatEl.title = `Click to cycle category (${nextCat})`;
            });
        });
    }

    generateBtn.addEventListener('click', generateGrid);
    generateGrid();

    saveVenueBtn.addEventListener('click', async () => {
        const name = document.getElementById('venue-name').value;
        const location = document.getElementById('venue-location').value;
        const address = document.getElementById('venue-address').value;

        if (!name || !location || !address) {
            showToast('Please fill in venue name, city/location, and address', 'warning');
            return;
        }

        try {
            saveVenueBtn.disabled = true;
            saveVenueBtn.textContent = 'Saving venue...';

            await api.createVenue({
                name,
                location,
                address,
                layoutSeats
            });

            showToast('Venue & Seating Layout created successfully!', 'success');
            setTimeout(() => window.location.href = '/admin/dashboard.html', 1000);

        } catch (err) {
            showToast(err.message, 'error');
            saveVenueBtn.disabled = false;
            saveVenueBtn.textContent = 'Save Venue Layout';
        }
    });
}
