import { api } from './api.js';
import { formatCurrency, formatDate, formatTime } from './utils.js';

export async function loadEvents(filters = {}) {
    const grid = document.getElementById('events-grid');
    if (!grid) return;

    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Loading events...</div>`;

    try {
        const data = await api.getEvents(filters);
        const events = data.events;

        if (!events || events.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
                    <h3 style="margin-bottom: 8px;">No events found</h3>
                    <p style="color: var(--text-muted);">Try adjusting your search criteria or filters.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = events.map(ev => {
            const isSoldOut = ev.available_seats <= 0;
            let badgeClass = 'badge-movie';
            if (ev.event_type === 'concert') badgeClass = 'badge-concert';
            else if (ev.event_type === 'sports') badgeClass = 'badge-sports';

            const priceText = ev.min_price ? `From ${formatCurrency(ev.min_price)}` : 'Tickets Available';

            return `
                <div class="card" style="display: flex; flex-direction: column;">
                    <div style="position: relative; height: 220px; overflow: hidden; background: #1e293b;">
                        <img src="${ev.poster_url}" alt="${ev.title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1000&q=80'" />
                        <span class="badge ${badgeClass}" style="position: absolute; top: 12px; left: 12px;">${ev.event_type}</span>
                        ${isSoldOut ? `<span class="badge badge-soldout" style="position: absolute; top: 12px; right: 12px;">SOLD OUT</span>` : ''}
                    </div>

                    <div style="padding: 20px; display: flex; flex-direction: column; flex-grow: 1;">
                        <h3 style="font-size: 1.15rem; margin-bottom: 8px; font-weight: 700;">${ev.title}</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">
                            📍 ${ev.venue_name}, ${ev.venue_location}
                        </p>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px;">
                            📅 ${formatDate(ev.start_date)} • ⏰ ${formatTime(ev.start_date)}
                        </p>

                        <div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 16px;">
                            <div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">PRICE</div>
                                <div style="font-size: 1.1rem; font-weight: 800; color: var(--accent-primary);">${priceText}</div>
                            </div>
                            <a href="/event-details.html?id=${ev.id}" class="btn ${isSoldOut ? 'btn-outline' : 'btn-primary'}" style="padding: 8px 16px; font-size: 0.85rem;">
                                ${isSoldOut ? 'Join Waitlist' : 'Select Seats'}
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 40px;">Failed to load events: ${err.message}</div>`;
    }
}
