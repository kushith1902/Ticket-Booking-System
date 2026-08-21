import { api } from './api.js';
import { showToast } from './toast.js';

export function getCurrentUser() {
    const userStr = localStorage.getItem('ticketflow_user');
    return userStr ? JSON.parse(userStr) : null;
}

export function renderNavbar() {
    const user = getCurrentUser();
    const navActions = document.getElementById('nav-actions');
    const navLinks = document.getElementById('nav-links');

    if (navLinks) {
        let roleLinks = '';
        if (user && user.role === 'organiser') {
            roleLinks = `<li><a href="/organiser/dashboard.html" class="nav-link">Organiser Portal</a></li>`;
        } else if (user && user.role === 'admin') {
            roleLinks = `
                <li><a href="/admin/dashboard.html" class="nav-link">Admin Portal</a></li>
                <li><a href="/admin/venue-builder.html" class="nav-link">Venue Builder</a></li>
            `;
        }

        navLinks.innerHTML = `
            <li><a href="/index.html" class="nav-link">Home</a></li>
            <li><a href="/events.html?type=movie" class="nav-link">Movies</a></li>
            <li><a href="/events.html?type=concert" class="nav-link">Concerts</a></li>
            <li><a href="/events.html?type=sports" class="nav-link">Sports</a></li>
            ${roleLinks}
            ${user ? `
                <li><a href="/bookings.html" class="nav-link">My Bookings</a></li>
                <li><a href="/waitlist.html" class="nav-link">My Waitlists</a></li>
            ` : ''}
        `;
    }

    if (navActions) {
        if (user) {
            navActions.innerHTML = `
                <div class="notification-bell" id="notif-btn" title="Notifications">
                    🔔 <span class="notification-badge" id="notif-count" style="display:none;">0</span>
                </div>
                <div class="user-menu" id="user-menu-btn">
                    <div class="avatar">${user.name.charAt(0).toUpperCase()}</div>
                    <div class="dropdown-menu" id="user-dropdown">
                        <div class="dropdown-item" style="font-weight: bold; color: #fff;">${user.name}</div>
                        <div class="dropdown-item" style="font-size: 0.8rem; color: var(--text-muted);">${user.email} (${user.role})</div>
                        <hr style="border:0; border-top:1px solid var(--border-color); margin: 4px 0;">
                        <a href="/bookings.html" class="dropdown-item">🎟 Booking History</a>
                        <a href="/waitlist.html" class="dropdown-item">⏳ Waitlist Entries</a>
                        <div class="dropdown-item" id="logout-btn" style="color: #ef4444; cursor: pointer;">🚪 Logout</div>
                    </div>
                </div>
            `;

            // Setup menu toggle
            const menuBtn = document.getElementById('user-menu-btn');
            const dropdown = document.getElementById('user-dropdown');
            if (menuBtn && dropdown) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.toggle('show');
                });
                document.addEventListener('click', () => dropdown.classList.remove('show'));
            }

            // Setup Logout
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    localStorage.removeItem('ticketflow_token');
                    localStorage.removeItem('ticketflow_user');
                    showToast('Logged out successfully', 'info');
                    setTimeout(() => window.location.href = '/index.html', 500);
                });
            }

            // Load Notification Count
            api.getNotifications().then(data => {
                const countBadge = document.getElementById('notif-count');
                if (countBadge && data.unreadCount > 0) {
                    countBadge.textContent = data.unreadCount;
                    countBadge.style.display = 'flex';
                }
            }).catch(() => {});

        } else {
            navActions.innerHTML = `
                <a href="/login.html" class="btn btn-outline" style="padding: 8px 16px;">Log In</a>
                <a href="/register.html" class="btn btn-primary" style="padding: 8px 16px;">Sign Up</a>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderNavbar();

    // Login Form Handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const submitBtn = loginForm.querySelector('button[type="submit"]');

            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Logging in...';

                const data = await api.login(email, password);
                localStorage.setItem('ticketflow_token', data.token);
                localStorage.setItem('ticketflow_user', JSON.stringify(data.user));

                showToast('Login successful!', 'success');
                setTimeout(() => {
                    if (data.user.role === 'admin') window.location.href = '/admin/dashboard.html';
                    else if (data.user.role === 'organiser') window.location.href = '/organiser/dashboard.html';
                    else window.location.href = '/index.html';
                }, 500);
            } catch (err) {
                showToast(err.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Log In';
            }
        });
    }

    // Register Form Handler
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const role = document.getElementById('role') ? document.getElementById('role').value : 'customer';
            const phone = document.getElementById('phone') ? document.getElementById('phone').value : '';
            const submitBtn = registerForm.querySelector('button[type="submit"]');

            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Creating account...';

                const data = await api.register({ name, email, password, role, phone });
                localStorage.setItem('ticketflow_token', data.token);
                localStorage.setItem('ticketflow_user', JSON.stringify(data.user));

                showToast('Account created successfully!', 'success');
                setTimeout(() => {
                    if (data.user.role === 'organiser') window.location.href = '/organiser/dashboard.html';
                    else window.location.href = '/index.html';
                }, 500);
            } catch (err) {
                showToast(err.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
            }
        });
    }
});
