const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';

// Initialiseer lokaal SQLite databestand
const dbPath = path.resolve(__dirname, 'brecht_transport.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Fout bij openen SQLite database:", err.message);
    } else {
        console.log("✅ Verbonden met lokale SQLite database:", dbPath);
        initSqliteTables();
    }
});

// Maak tabellen automatisch aan als ze niet bestaan
function initSqliteTables() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS accounts (
            username TEXT PRIMARY KEY,
            password TEXT,
            role TEXT,
            isDev INTEGER,
            avatarUrl TEXT,
            discordId TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            from_loc TEXT,
            to_loc TEXT,
            driver TEXT,
            cargo TEXT,
            distance TEXT,
            kmAmount INTEGER,
            paidAmount REAL,
            timestamp INTEGER,
            weekKey TEXT,
            dateFormatted TEXT
        )`);

        // Vul standaard accounts als de tabel leeg is
        db.get("SELECT COUNT(*) as count FROM accounts", (err, row) => {
            if (row && row.count === 0) {
                const defaultAccounts = [
                    ["DEV ACCOUNT", "DEVACC123", "Directeur", 1, "", ""],
                    ["MJGamerNL", "Wachtwoord123", "Directeur", 0, "", ""],
                    ["ItzChaotic_", "ChaoticPassword!", "Onder Directeur & Development", 0, "", ""],
                    ["Ramona", "RamonaPass2026", "Onder Directeur", 0, "", ""],
                    ["JoeyKj", "JoeyPassword", "Management", 0, "", ""],
                    ["Jellybear", "JellyBearPass", "Management", 0, "", ""],
                    ["Dansco54", "DanscoPass", "Leidinggevende", 0, "", ""],
                    ["Zinnorax", "ZinnoraxPass", "Leidinggevende", 0, "", ""]
                ];
                const stmt = db.prepare("INSERT INTO accounts (username, password, role, isDev, avatarUrl, discordId) VALUES (?, ?, ?, ?, ?, ?)");
                defaultAccounts.forEach(acc => stmt.run(acc));
                stmt.finalize();
                console.log("✅ Standaard accounts ingeladen in SQLite!");
            }
        });
    });
}

function cleanText(text) { return text ? text.replace(/[\*\_\`]/g, '').trim() : ''; }
function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9\,\.]/g, '').replace(',', '.')) || 0;
}

function getRoleWeight(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('directeur') && !r.includes('onder')) return 8;
    if (r.includes('onder directeur')) return 7;
    if (r.includes('management')) return 6;
    if (r.includes('leidinggevende')) return 5;
    return 3;
}

function getRoleColor(role) {
    const r = (role || '').toLowerCase().trim();
    if (r.includes('onder directeur')) return 'orange';
    if (r.includes('directeur')) return 'red';
    if (r.includes('management')) return 'yellow';
    if (r.includes('leidinggevende')) return 'green';
    return 'purple';
}

function getISOWeekKey(timestamp) {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `Wk ${weekNo}`;
}

const clientBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

clientBot.on('clientReady', () => {
    console.log(`🤖 Discord Bot ingelogd als ${clientBot.user.tag}`);
});

clientBot.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) parseAndAddJob(message);
});

function parseAndAddJob(message) {
    try {
        let from = '', to = '', driver = '', cargo = 'Vracht', distanceStr = '0 km', paidAmount = 0;
        let timestamp = message.createdTimestamp || Date.now();

        if (message.embeds?.[0]) {
            const embed = message.embeds[0];
            const title = embed.title || '';
            if (title.includes('→')) { const p = title.split('→'); from = cleanText(p[0]); to = cleanText(p[1]); }
            embed.fields?.forEach(f => {
                if (f.name.toLowerCase().includes('driver')) driver = cleanText(f.value);
                if (f.name.toLowerCase().includes('distance')) distanceStr = cleanText(f.value);
                if (f.name.toLowerCase().includes('paid')) paidAmount = parseCurrency(f.value);
            });
        }
        if (!from || !to) return;
        if (!driver) driver = cleanText(message.author.username);
        const kmAmount = parseInt(distanceStr.replace(/\D/g, ''), 10) || 0;
        if (paidAmount === 0 && kmAmount > 0) paidAmount = kmAmount * 35;

        const jobId = message.id || "job-" + Date.now();
        const weekKey = getISOWeekKey(timestamp);
        const dateFormatted = new Date(timestamp).toLocaleDateString('nl-NL');

        db.run(`INSERT OR REPLACE INTO jobs (id, from_loc, to_loc, driver, cargo, distance, kmAmount, paidAmount, timestamp, weekKey, dateFormatted) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [jobId, from, to, driver, cargo, `${kmAmount.toLocaleString('nl-NL')} km`, kmAmount, paidAmount, timestamp, weekKey, dateFormatted]);
    } catch(e) {}
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM accounts WHERE LOWER(username) = LOWER(?) AND password = ?`, [(username || '').trim(), password], (err, account) => {
        if (err || !account) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });
        
        res.json({ 
            success: true, 
            username: account.username, 
            role: account.role, 
            color: getRoleColor(account.role), 
            avatarUrl: account.avatarUrl || ''
        });
    });
});

app.get('/api/haulmp', (req, res) => {
    const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);

    db.all(`SELECT * FROM jobs WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 50`, [tenDaysAgo], (err, allJobsHistory) => {
        if (err) allJobsHistory = [];

        db.all(`SELECT * FROM accounts`, (err2, accountsList) => {
            if (err2) accountsList = [];

            const totalDeliveries = allJobsHistory.length;
            const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
            const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidAmount, 0);

            let formattedDrivers = accountsList.map(m => {
                const userJobs = allJobsHistory.filter(j => j.driver && j.driver.toLowerCase().includes(m.username.toLowerCase()));
                return {
                    username: m.username, role: m.role, weight: getRoleWeight(m.role), color: getRoleColor(m.role), isDev: !!m.isDev,
                    avatarUrl: m.avatarUrl || '',
                    deliveries: userJobs.length,
                    distance: `${userJobs.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
                    earnings: `€ ${userJobs.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`
                };
            });

            formattedDrivers.sort((a, b) => b.weight - a.weight);

            res.json({
                deliveries: totalDeliveries.toString(),
                distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
                companyEarnings: `€ ${totalCompanyEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
                drivers: formattedDrivers.filter(d => !d.isDev).length.toString(),
                drivers_list: formattedDrivers,
                recent_jobs: allJobsHistory.slice(0, 10),
                employeeOfTheWeek: { username: "MJGamerNL", reason: "Uitstekende inzet!" }
            });
        });
    });
});

app.get('/api/gallery', (req, res) => {
    res.json([{ id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" }]);
});

if (DISCORD_BOT_TOKEN) {
    clientBot.login(DISCORD_BOT_TOKEN).catch(err => {});
}

app.listen(PORT, () => console.log(`🚀 Server actief op poort ${PORT} met SQLite`));
