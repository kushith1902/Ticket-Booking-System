import { api } from './api.js';
import { formatDate } from './utils.js';
import { showToast } from './toast.js';

export async function loadWaitlists() {
    const listEl = document.getElementById('waitlist-container');
    if (!listEl) return;

    listEl.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading waitlist entries...</div>`;

    try {
        const data = await api.getMyWaitlists();
        const waitlists = data.waitlists;

        if (!waitlists || waitlists.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
                    <h3 style="margin-bottom: 8px;">No active waitlist entries</h3>
                    <p style="color: var(--text-muted);">When popular events sell out, join the waitlist to receive instant priority offers!</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = waitlists.map(w => {
            const hasOffer = w.status === 'OFFERED' && w.offer_token;

            return `
                <div class="card" style="padding: 24px; margin-bottom: 20px; border-left: 4px solid ${hasOffer ? 'var(--accent-primary)' : 'var(--accent-secondary)'};">
                    ${hasOffer ? `
                        <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid var(--accent-primary); padding: 14px 20px; border-radius: var(--radius-sm); margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="color: var(--accent-primary); margin-bottom: 2px;">⚡ TICKET OFFER AVAILABLE!</h4>
                                <p style="font-size: 0.85rem; color: var(--text-secondary);">Seat <strong>${w.row_label}${w.seat_number}</strong> (${w.category}) is reserved for you. Claim before ${w.offer_expires_at}!</p>
                            </div>
                            <button class="btn btn-primary claim-offer-btn" data-token="${w.offer_token}">CLAIM TICKET</button>
                        </div>
                    ` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                        <div style="display: flex; gap: 16px; align-items: center;">
                            <img src="${w.poster_url}" alt="${w.event_title}" style="width: 60px; height: 80px; object-fit: cover; border-radius: var(--radius-sm);" />
                            <div>
                                <h3 style="font-size: 1.1rem; margin-bottom: 4px;">${w.event_title}</h3>
                                <p style="font-size: 0.85rem; color: var(--text-muted);">📍 ${w.venue_name}</p>
                                <p style="font-size: 0.85rem; color: var(--text-secondary);">Category: <strong>${w.category}</strong> • Joined ${formatDate(w.created_at)}</p>
                            </div>
                        </div>

                        <div style="text-align: right;">
                            <div style="font-size: 0.75rem; color: var(--text-muted);">QUEUE POSITION</div>
                            <div style="font-size: 1.8rem; font-weight: 800; color: var(--accent-secondary);">#${w.position}</div>
                            <div class="badge ${w.status === 'OFFERED' ? 'badge-concert' : 'badge-movie'}" style="margin-top: 4px;">${w.status}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach Claim Offer Handler
        listEl.querySelectorAll('.claim-offer-btn').forEach(btn => {
            btn.onclick = async () => {
                const token = btn.dataset.token;
                try {
                    btn.disabled = true;
                    btn.textContent = 'Claiming...';
                    const claimRes = await api.claimWaitlistOffer(token);

                    showToast('Offer claimed! Proceeding to seat selection/checkout...', 'success');

                    sessionStorage.setItem('ticketflow_checkout', JSON.stringify({
                        eventId: claimRes.eventId,
                        seatIds: [claimRes.seatId],
                        holdToken: token,
                        expiresAt: claimRes.expiresAt
                    }));

                    setTimeout(() => {
                        window.location.href = `/checkout.html?event=${claimRes.eventId}`;
                    }, 800);

                } catch (err) {
                    showToast(err.message, 'error');
                    btn.disabled = false;
                    btn.textContent = 'CLAIM TICKET';
                }
            };
        });

    } catch (err) {
        listEl.innerHTML = `<div style="padding: 40px; color: #ef4444;">Failed to load waitlist entries: ${err.message}</div>`;
    }
}
