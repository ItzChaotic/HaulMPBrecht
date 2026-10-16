const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
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
const MONGO_URI = process.env.MONGO_URI;

// Verbinding maken met MongoDB Atlas
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
}).then(() => {
    console.log("✅ Verbonden met MongoDB Atlas!");
    initMongoDefaults();
}).catch(err => {
    console.error("❌ Fout bij verbinden met MongoDB:", err.message);
});

// Schema's en Modellen voor MongoDB
const accountSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    role: String,
    isDev: Number,
    avatarUrl: String,
    discordId: String
});
const Account = mongoose.model('Account', accountSchema);

const jobSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    from_loc: String,
    to_loc: String,
    driver: String,
    cargo: String,
    distance: String,
    kmAmount: Number,
    paidAmount: Number,
    timestamp: Number,
    weekKey: String,
    dateFormatted: String
});
const Job = mongoose.model('Job', jobSchema);

// Standaard accounts inladen als de collectie leeg is
async function initMongoDefaults() {
    try {
        const count = await Account.countDocuments();
        if (count === 0) {
            const defaultAccounts = [
                { username: "DEV ACCOUNT", password: "DEVACC123", role: "Directeur", isDev: 1, avatarUrl: "", discordId: "" },
                { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur", isDev: 0, avatarUrl: "", discordId: "" },
                { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur & Development", isDev: 0, avatarUrl: "", discordId: "" },
                { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur", isDev: 0, avatarUrl: "", discordId: "" },
                { username: "JoeyKj", password: "JoeyPassword", role: "Management", isDev: 0, avatarUrl: "", discordId: "" },
                { username: "Jellybear", password: "JellyBearPass", role: "Management", isDev: 0, avatarUrl: "", discordId: "" },
                { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende", isDev: 0, avatarUrl: "", discordId: "" },
                { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende", isDev: 0, avatarUrl: "", discordId: "" }
            ];
            await Account.insertMany(defaultAccounts);
            console.log("✅ Standaard accounts ingeladen in MongoDB!");
        }
    } catch (e) {
        console.error("Fout bij laden standaard accounts:", e.message);
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

        await Job.findOneAndUpdate(
            { id: jobId },
            { from_loc: from, to_loc: to, driver, cargo, distance: `${kmAmount.toLocaleString('nl-NL')} km`, kmAmount, paidAmount, timestamp, weekKey, dateFormatted },
            { upsert: true, new: true }
        );
    } catch(e) {}
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const account = await Account.findOne({ 
            username: { $regex: new RegExp(`^${(username || '').trim()}$`, 'i') }, 
            password: password 
        });
        if (!account) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });
        
        res.json({ 
            success: true, 
            username: account.username, 
            role: account.role, 
            color: getRoleColor(account.role), 
            avatarUrl: account.avatarUrl || ''
        });
    } catch(e) {
        res.status(500).json({ success: false, message: 'Serverfout' });
    }
});

app.get('/api/haulmp', async (req, res) => {
    try {
        const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
        const allJobsHistory = await Job.find({ timestamp: { $gte: tenDaysAgo } }).sort({ timestamp: -1 }).limit(50);
        const accountsList = await Account.find({});

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

app.listen(PORT, () => console.log(`🚀 Server actief op poort ${PORT} met MongoDB`));
