// Socket.IO Client Wrapper
import { showToast } from './toast.js';

let socket = null;

export function initWebSocket(eventId = null, onSeatUpdate = null) {
    if (typeof io === 'undefined') {
        console.warn('Socket.IO library script not loaded.');
        return null;
    }

    if (!socket) {
        socket = io();
    }

    socket.on('connect', () => {
        // console.log('Socket connected:', socket.id);
        if (eventId) {
            socket.emit('join:event', eventId);
        }
    });

    if (onSeatUpdate) {
        socket.off('seat:update'); // Prevent duplicate listeners
        socket.on('seat:update', (data) => {
            onSeatUpdate(data);
        });
    }

    // Check for targeted waitlist offer notifications
    const userStr = localStorage.getItem('ticketflow_user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            socket.off(`waitlist:offer:${user.id}`);
            socket.on(`waitlist:offer:${user.id}`, (offerData) => {
                showToast(`⚡ TICKET AVAILABLE! ${offerData.eventTitle} (${offerData.category}). Check your Waitlist dashboard!`, 'warning');
            });
        } catch (e) {}
    }

    return socket;
}
