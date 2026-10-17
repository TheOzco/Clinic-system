const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// اتصال به دیتابیس SQLite (لوکال)
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Error opening database', err.message);
    else console.log('Connected to the SQLite database.');
});

// ایجاد جداول پایه
db.serialize(() => {
    // جدول رتبه‌های رنگی
    db.run(`CREATE TABLE IF NOT EXISTS ranks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        color_name TEXT UNIQUE,
        discount_percent REAL
    )`);

    // جدول کلاینت‌ها و کارت اتوماسیون
    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        phone TEXT,
        card_id TEXT UNIQUE,
        rank_id INTEGER,
        FOREIGN KEY(rank_id) REFERENCES ranks(id)
    )`);

    // جدول لاین‌ها و خدمات
    db.run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        line_name TEXT, -- laser, massage, skin_hair
        service_name TEXT,
        base_price REAL
    )`);

    // جدول روند درمانی کلاینت (تعداد جلسات)
    db.run(`CREATE TABLE IF NOT EXISTS client_treatments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        service_id INTEGER,
        total_sessions INTEGER,
        completed_sessions INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active',
        FOREIGN KEY(client_id) REFERENCES clients(id),
        FOREIGN KEY(service_id) REFERENCES services(id)
    )`);
});

// --- APIها ---

// ۱. ثبت کلاینت جدید
app.post('/api/clients', (req, res) => {
    const { name, phone, card_id, rank_id } = req.body;
    db.run(`INSERT INTO clients (name, phone, card_id, rank_id) VALUES (?, ?, ?, ?)`,
        [name, phone, card_id, rank_id], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ message: 'Client added successfully', clientId: this.lastID });
        });
});

// ۲. دریافت اطلاعات کلاینت با کارت اتوماسیون (برای اسکن کارت در کلینیک)
app.get('/api/clients/card/:card_id', (req, res) => {
    const cardId = req.params.card_id;
    const query = `
        SELECT c.*, r.color_name, r.discount_percent 
        FROM clients c 
        LEFT JOIN ranks r ON c.rank_id = r.id 
        WHERE c.card_id = ?
    `;
    db.get(query, [cardId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Client not found' });
        res.json(row);
    });
});

// ۳. مدیریت خدمات (افزودن خدمت جدید به لاین‌ها)
app.post('/api/services', (req, res) => {
    const { line_name, service_name, base_price } = req.body;
    db.run(`INSERT INTO services (line_name, service_name, base_price) VALUES (?, ?, ?)`,
        [line_name, service_name, base_price], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ message: 'Service added successfully', serviceId: this.lastID });
        });
});

// ۴. ثبت روند درمانی و تعداد جلسات کلاینت
app.post('/api/treatments', (req, res) => {
    const { client_id, service_id, total_sessions } = req.body;
    db.run(`INSERT INTO client_treatments (client_id, service_id, total_sessions) VALUES (?, ?, ?)`,
        [client_id, service_id, total_sessions], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ message: 'Treatment assigned successfully', treatmentId: this.lastID });
        });
});

// ۵. بروزرسانی جلسات انجام شده (کم کردن از مانده جلسات)
app.patch('/api/treatments/:id/progress', (req, res) => {
    const treatmentId = req.params.id;
    db.get(`SELECT total_sessions, completed_sessions FROM client_treatments WHERE id = ?`, [treatmentId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Treatment not found' });
        
        if (row.completed_sessions >= row.total_sessions) {
            return res.status(400).json({ message: 'All sessions are completed!' });
        }

        const newCompleted = row.completed_sessions + 1;
        const status = newCompleted >= row.total_sessions ? 'Completed' : 'Active';

        db.run(`UPDATE client_treatments SET completed_sessions = ?, status = ? WHERE id = ?`,
            [newCompleted, status, treatmentId], function(err) {
                if (err) return res.status(400).json({ error: err.message });
                res.json({ message: 'Session updated successfully', completed_sessions: newCompleted, status });
            });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
          
