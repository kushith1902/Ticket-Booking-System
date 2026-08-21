const http = require('http');

function postJSON(urlPath, data, token) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: urlPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        }, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(resBody) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: resBody });
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function runConcurrencyTest() {
    console.log('--- STARTING CONCURRENCY SAFETY TEST ---');

    // 1. Login user 1 & user 2
    console.log('Logging in Test Customer 1 & 2...');
    const user1Res = await postJSON('/api/auth/login', { email: 'customer@example.com', password: 'Password123!' });
    const user2Res = await postJSON('/api/auth/login', { email: 'user2@example.com', password: 'Password123!' });

    const token1 = user1Res.data.token;
    const token2 = user2Res.data.token;

    console.log('User 1 Token obtained:', !!token1);
    console.log('User 2 Token obtained:', !!token2);

    // 2. Fetch seats for event #1
    const seatsRes = await new Promise((resolve) => {
        http.get('http://localhost:3000/api/seats/events/1/seats', (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(JSON.parse(body)));
        });
    });

    const targetSeat = seatsRes.seats.find(s => s.status === 'AVAILABLE');
    if (!targetSeat) {
        console.error('No available seats found for testing concurrency!');
        return;
    }

    console.log(`Target Seat selected for simultaneous hold attack: #${targetSeat.id} (${targetSeat.row_label}${targetSeat.seat_number})`);

    // 3. Fire simultaneous hold requests
    console.log('Dispatching simultaneous POST /api/seats/hold requests for User 1 and User 2...');
    const req1 = postJSON('/api/seats/hold', { eventId: 1, seatIds: [targetSeat.id] }, token1);
    const req2 = postJSON('/api/seats/hold', { eventId: 1, seatIds: [targetSeat.id] }, token2);

    const [res1, res2] = await Promise.all([req1, req2]);

    console.log(`User 1 Response Status: ${res1.status}`, res1.data);
    console.log(`User 2 Response Status: ${res2.status}`, res2.data);

    const successes = [res1, res2].filter(r => r.status === 200);
    const conflicts = [res1, res2].filter(r => r.status === 409);

    if (successes.length === 1 && conflicts.length === 1) {
        console.log('\n✅ CONCURRENCY TEST PASSED PERFECTLY!');
        console.log('Exact 1 request succeeded with seat hold lock and 1 request received HTTP 409 Conflict.');
    } else {
        console.error('\n❌ CONCURRENCY TEST FAILED!', { successCount: successes.length, conflictCount: conflicts.length });
    }
}

runConcurrencyTest().catch(console.error);
