const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { Pool } = require('pg');
const multer = require('multer');

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
const DATABASE_URL = process.env.DATABASE_URL;

// Verbinding maken met Supabase PostgreSQL
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Vereist voor veilige cloud-verbindingen met Supabase
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Fout bij verbinden met Supabase PostgreSQL:', err.stack);
    } else {
        console.log('✅ Succesvol verbonden met Supabase PostgreSQL!');
        release();
        initPostgresTables();
    }
});

// Automatisch tabellen aanmaken in Supabase
async function initPostgresTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS accounts (
                username TEXT PRIMARY KEY,
                password TEXT,
                role TEXT,
                isDev INTEGER,
                avatarUrl TEXT,
                discordId TEXT
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                from_loc TEXT,
                to_loc TEXT,
                driver TEXT,
                cargo TEXT,
                distance TEXT,
                kmAmount INTEGER,
                paidAmount REAL,
                timestamp BIGINT,
                weekKey TEXT,
                dateFormatted TEXT
            );
        `);

        // Standaard accounts invoeren als de tabel leeg is
        const res = await pool.query('SELECT COUNT(*) FROM accounts');
        if (parseInt(res.rows[0].count) === 0) {
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

            for (let acc of defaultAccounts) {
                await pool.query(
                    `INSERT INTO accounts (username, password, role, isDev, avatarUrl, discordId) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO NOTHING`,
                    acc
                );
            }
            console.log("✅ Standaard accounts ingeladen in Supabase!");
        }
    } catch (err) {
        console.error("❌ Fout bij initialiseren van tabellen:", err.message);
    }
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

async function parseAndAddJob(message) {
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

        await pool.query(
            `INSERT INTO jobs (id, from_loc, to_loc, driver, cargo, distance, kmAmount, paidAmount, timestamp, weekKey, dateFormatted) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO UPDATE SET from_loc = $2, to_loc = $3, driver = $4, cargo = $5, distance = $6, kmAmount = $7, paidAmount = $8`,
            [jobId, from, to, driver, cargo, `${kmAmount.toLocaleString('nl-NL')} km`, kmAmount, paidAmount, timestamp, weekKey, dateFormatted]
        );
    } catch(e) {}
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            `SELECT * FROM accounts WHERE LOWER(username) = LOWER($1) AND password = $2`,
            [(username || '').trim(), password]
        );
        if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });

        const account = result.rows[0];
        res.json({ 
            success: true, 
            username: account.username, 
            role: account.role, 
            color: getRoleColor(account.role), 
            avatarUrl: account.avatarurl || ''
        });
    } catch(e) {
        res.status(500).json({ success: false, message: 'Serverfout' });
    }
});

app.get('/api/haulmp', async (req, res) => {
    try {
        const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);

        const jobsResult = await pool.query(
            `SELECT * FROM jobs WHERE timestamp >= $1 ORDER BY timestamp DESC LIMIT 50`,
            [tenDaysAgo]
        );
        const allJobsHistory = jobsResult.rows;

        const accountsResult = await pool.query(`SELECT * FROM accounts`);
        const accountsList = accountsResult.rows;

        const totalDeliveries = allJobsHistory.length;
        const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmamount, 0);
        const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidamount, 0);

        let formattedDrivers = accountsList.map(m => {
            const userJobs = allJobsHistory.filter(j => j.driver && j.driver.toLowerCase().includes(m.username.toLowerCase()));
            return {
                username: m.username, role: m.role, weight: getRoleWeight(m.role), color: getRoleColor(m.role), isDev: !!m.isdev,
                avatarUrl: m.avatarurl || '',
                deliveries: userJobs.length,
                distance: `${userJobs.reduce((a, c) => a + c.kmamount, 0).toLocaleString('nl-NL')} km`,
                earnings: `€ ${userJobs.reduce((a, c) => a + c.paidamount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`
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
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/gallery', (req, res) => {
    res.json([{ id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" }]);
});

if (DISCORD_BOT_TOKEN) {
    clientBot.login(DISCORD_BOT_TOKEN).catch(err => {});
}

app.listen(PORT, () => console.log(`🚀 Server actief op poort ${PORT} met Supabase PostgreSQL`));
