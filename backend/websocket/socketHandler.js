let ioInstance = null;

function initSocket(io) {
    ioInstance = io;

    io.on('connection', (socket) => {
        // console.log(`Socket connected: ${socket.id}`);

        socket.on('join:event', (eventId) => {
            const room = `event_${eventId}`;
            socket.join(room);
            // console.log(`Socket ${socket.id} joined room ${room}`);
        });

        socket.on('leave:event', (eventId) => {
            const room = `event_${eventId}`;
            socket.leave(room);
            // console.log(`Socket ${socket.id} left room ${room}`);
        });

        socket.on('disconnect', () => {
            // console.log(`Socket disconnected: ${socket.id}`);
        });
    });
}

function emitSeatStatusChange(eventId, seatIds, status, userId = null) {
    if (!ioInstance) return;
    const room = `event_${eventId}`;
    ioInstance.to(room).emit('seat:update', {
        eventId,
        seatIds: Array.isArray(seatIds) ? seatIds : [seatIds],
        status,
        userId,
        timestamp: new Date().toISOString()
    });
}

function emitWaitlistOffer(userId, offerData) {
    if (!ioInstance) return;
    ioInstance.emit(`waitlist:offer:${userId}`, offerData);
}

module.exports = {
    initSocket,
    emitSeatStatusChange,
    emitWaitlistOffer
};
