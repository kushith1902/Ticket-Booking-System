import { api } from './api.js';
import { formatCurrency, formatDate } from './utils.js';
import { showToast } from './toast.js';

export async function initOrganiserDashboard() {
    const metricsEl = document.getElementById('organiser-metrics');
    const eventsTableEl = document.getElementById('organiser-events-body');

    if (!metricsEl || !eventsTableEl) return;

    try {
        const data = await api.getOrganiserDashboard();
        const { metrics, events } = data;

        metricsEl.innerHTML = `
            <div class="metric-card">
                <div class="metric-title">Total Revenue</div>
                <div class="metric-value" style="color: var(--accent-primary);">${formatCurrency(metrics.totalRevenue)}</div>
                <div class="metric-sub">Confirmed Sales</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Tickets Sold</div>
                <div class="metric-value">${metrics.ticketsSold}</div>
                <div class="metric-sub">Issued Tickets</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Occupancy Rate</div>
                <div class="metric-value" style="color: var(--accent-secondary);">${metrics.occupancyRate}%</div>
                <div class="metric-sub">Average Seat Fill</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Waitlist Demand</div>
                <div class="metric-value" style="color: #f59e0b;">${metrics.waitlistRequests}</div>
                <div class="metric-sub">Active Queue</div>
            </div>
        `;

        if (!events || events.length === 0) {
            eventsTableEl.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No events created yet.</td></tr>`;
            return;
        }

        eventsTableEl.innerHTML = events.map(ev => `
            <tr>
                <td>
                    <div style="font-weight: 700;">${ev.title}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${ev.event_type.toUpperCase()} • 📍 ${ev.venue_name}</div>
                </td>
                <td>${formatDate(ev.start_date)}</td>
                <td>${ev.booked_seats} / ${ev.total_seats}</td>
                <td><strong style="color: var(--accent-primary);">${formatCurrency(ev.revenue)}</strong></td>
                <td><span class="badge badge-available">${ev.status}</span></td>
                <td>
                    <a href="/event-details.html?id=${ev.id}" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;">View</a>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        showToast('Failed to load organiser metrics: ' + err.message, 'error');
    }
}
