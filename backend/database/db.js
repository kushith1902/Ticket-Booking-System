const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../ticketflow.db');
const schemaPath = path.resolve(__dirname, 'schema.sql');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database at', dbPath);
    }
});

// Enable WAL mode for better concurrency performance
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = ON;');

function initDb() {
    return new Promise((resolve, reject) => {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(sql, (err) => {
            if (err) {
                console.error('Error initializing schema:', err.message);
                return reject(err);
            }
            console.log('Database schema initialized.');
            resolve();
        });
    });
}

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// Transaction wrapper helper using BEGIN IMMEDIATE to lock writer mutex for concurrency safety
async function transaction(fn) {
    await run('BEGIN IMMEDIATE TRANSACTION');
    try {
        const result = await fn();
        await run('COMMIT');
        return result;
    } catch (err) {
        await run('ROLLBACK');
        throw err;
    }
}

module.exports = {
    db,
    initDb,
    query,
    get,
    run,
    transaction
};
