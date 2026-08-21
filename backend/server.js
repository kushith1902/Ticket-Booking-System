require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const os = require('os');
const { Server } = require('socket.io');

const { initDb } = require('./database/db');
const { runSeed } = require('./database/seed');
const { initSocket } = require('./websocket/socketHandler');
const { startTTLWorker } = require('./jobs/ttlWorker');

// Route imports
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const seatRoutes = require('./routes/seats');
const bookingRoutes = require('./routes/bookings');
const waitlistRoutes = require('./routes/waitlist');
const venueRoutes = require('./routes/venues');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Initialize Socket.IO connection handling
initSocket(io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets & pages
const frontendPath = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api', dashboardRoutes);

// Fallback to index.html for SPA routing if needed
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    const targetFile = path.join(frontendPath, req.path);
    if (require('fs').existsSync(targetFile) && require('fs').statSync(targetFile).isFile()) {
        return res.sendFile(targetFile);
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

function getNetworkIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push(net.address);
            }
        }
    }
    return ips;
}

initDb().then(async () => {
    // Automatically seed events and venues if database is fresh (e.g., on cloud deploy)
    await runSeed().catch(e => console.error('Auto-seed error:', e));

    server.listen(PORT, '0.0.0.0', () => {
        const ips = getNetworkIPs();
        console.log(`=======================================================`);
        console.log(`🚀 TicketFlow Application is live!`);
        console.log(`💻 Local Access:   http://localhost:${PORT}`);
        ips.forEach(ip => {
            console.log(`📱 Device Access:  http://${ip}:${PORT}`);
        });
        console.log(`=======================================================`);
        startTTLWorker();
    });
}).catch(err => {
    console.error('Database initialization failed:', err);
});
