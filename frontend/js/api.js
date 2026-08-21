// Centralized API Client Module
const API_BASE = '/api';

export function getToken() {
    return localStorage.getItem('ticketflow_token');
}

export async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`);
    }

    return data;
}

// Dedicated API Methods
export const api = {
    login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (userData) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
    getProfile: () => apiRequest('/auth/me'),

    getEvents: (params = {}) => {
        const queryStr = new URLSearchParams(params).toString();
        return apiRequest(`/events?${queryStr}`);
    },
    getEventDetails: (id) => apiRequest(`/events/${id}`),
    createEvent: (eventData) => apiRequest('/events', { method: 'POST', body: JSON.stringify(eventData) }),

    getSeats: (eventId) => apiRequest(`/seats/events/${eventId}/seats`),
    holdSeats: (eventId, seatIds) => apiRequest('/seats/hold', { method: 'POST', body: JSON.stringify({ eventId, seatIds }) }),
    releaseSeats: (eventId, seatIds) => apiRequest('/seats/release', { method: 'POST', body: JSON.stringify({ eventId, seatIds }) }),

    createBooking: (bookingData) => apiRequest('/bookings', { method: 'POST', body: JSON.stringify(bookingData) }),
    getBookings: () => apiRequest('/bookings'),
    getTicket: (id) => apiRequest(`/bookings/${id}`),
    cancelBooking: (id) => apiRequest(`/bookings/${id}/cancel`, { method: 'POST' }),

    joinWaitlist: (eventId, category) => apiRequest(`/events/${eventId}/waitlist`, { method: 'POST', body: JSON.stringify({ category }) }),
    getMyWaitlists: () => apiRequest('/waitlist/my'),
    claimWaitlistOffer: (token) => apiRequest(`/waitlist/offers/${token}/claim`, { method: 'POST' }),

    getVenues: () => apiRequest('/venues'),
    createVenue: (venueData) => apiRequest('/venues', { method: 'POST', body: JSON.stringify(venueData) }),

    getOrganiserDashboard: () => apiRequest('/organiser/dashboard'),
    getAdminDashboard: () => apiRequest('/admin/dashboard'),
    getNotifications: () => apiRequest('/notifications'),
    markNotificationsRead: () => apiRequest('/notifications/read', { method: 'PUT' })
};
