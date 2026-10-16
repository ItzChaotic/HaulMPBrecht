const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';
const DISCORD_APPLICATIONS_CHANNEL_ID = '1558075393729363968';
const MONGO_URI = process.env.MONGO_URI;

let db, accountsColl, announcementsColl, applicationsColl, infoColl, convoysColl, badgesColl, eotwColl, socialsColl;
let isConnected = false;

let defaultAccounts = [
    { username: "DEV ACCOUNT", password: "DEVACC123", role: "Directeur", isDev: true },
    { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur & Development" },
    { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

function getRoleRank(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('onder directeur')) return 90;
    if (r.includes('directeur')) return 100;
    if (r.includes('management')) return 80;
    if (r.includes('leidinggevende')) return 70;
    return 10;
}

function getRoleColor(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('onder directeur')) return 'orange';
    if (r.includes('directeur')) return 'red';
    if (r.includes('management')) return 'yellow';
    if (r.includes('leidinggevende')) return 'green';
    return 'gray';
}

async function connectDB() {
    if (!MONGO_URI) return;
    try {
        const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
        await client.connect();
        db = client.db('brecht_transport');
        
        accountsColl = db.collection('accounts');
        announcementsColl = db.collection('announcements');
        applicationsColl = db.collection('applications');
        infoColl = db.collection('info');
        convoysColl = db.collection('convoys');
        badgesColl = db.collection('badges');
        eotwColl = db.collection('eotw');
        socialsColl = db.collection('socials');

        isConnected = true;
        console.log("✅ MongoDB Verbonden!");

        const count = await accountsColl.countDocuments();
        if (count === 0) await accountsColl.insertMany(defaultAccounts);
    } catch (err) {
        console.error("❌ MongoDB Fout:", err.message);
    }
}
connectDB();

let allJobsHistory = [];

function cleanText(text) { return text ? text.replace(/[\*\_\`]/g, '').trim() : ''; }
function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9\,\.]/g, '').replace(',', '.')) || 0;
}

function isDriverMatch(jobDriver, accountUsername) {
    if (!jobDriver || !accountUsername) return false;
    const j = jobDriver.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = accountUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    return j === a || j.includes(a) || a.includes(j);
}

function getISOWeekKey(timestamp) {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return `Wk ${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)}`;
}

const clientBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

clientBot.on('clientReady', () => {
    console.log(`🤖 Bot Online als ${clientBot.user.tag}`);
    fetchAllHistoricalDiscordLogs();
});

clientBot.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) parseAndAddJob(message);
});

function parseAndAddJob(message) {
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

    const jobObj = { id: message.id || "job-" + Date.now(), from, to, driver, cargo, distance: `${kmAmount.toLocaleString('nl-NL')} km`, kmAmount, paidAmount, timestamp, weekKey: getISOWeekKey(timestamp), dateFormatted: new Date(timestamp).toLocaleDateString('nl-NL') };
    if (!allJobsHistory.some(j => j.id === jobObj.id)) allJobsHistory.push(jobObj);
}

async function fetchAllHistoricalDiscordLogs() {
    try {
        const channel = await clientBot.channels.fetch(DISCORD_CHANNEL_ID);
        if (channel) {
            let lastId = undefined; let fetched = 0; allJobsHistory = [];
            while (fetched < 200) {
                const opt = { limit: 100 }; if (lastId) opt.before = lastId;
                const msgs = await channel.messages.fetch(opt);
                if (msgs.size === 0) break;
                msgs.forEach(msg => parseAndAddJob(msg));
                lastId = msgs.last().id; fetched += msgs.size;
                if (msgs.size < 100) break;
            }
            allJobsHistory.sort((a, b) => b.timestamp - a.timestamp);
        }
    } catch (e) {}
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    let accountsDatabase = defaultAccounts;
    if (isConnected && accountsColl) accountsDatabase = await accountsColl.find({}).toArray();
    
    const account = accountsDatabase.find(acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password);
    if (!account) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });
    
    res.json({ success: true, username: account.username, role: account.role, color: getRoleColor(account.role) });
});

app.get('/api/haulmp', async (req, res) => {
    const totalDeliveries = allJobsHistory.length;
    const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
    const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidAmount, 0);

    let accountsDatabase = defaultAccounts;
    let customBadges = [], announcementsList = [], infoList = [], convoysList = [], socialsList = [];
    let employeeOfTheWeek = { username: "MJGamerNL", reason: "Uitstekende inzet!" };

    if (isConnected && db) {
        try {
            accountsDatabase = await accountsColl.find({}).toArray();
            customBadges = await badgesColl.find({}).toArray();
            announcementsList = await announcementsColl.find({}).sort({ _id: -1 }).toArray();
            infoList = await infoColl.find({}).sort({ _id: -1 }).toArray();
            convoysList = await convoysColl.find({}).sort({ _id: -1 }).toArray();
            socialsList = await socialsColl.find({}).toArray();
            const eotw = await eotwColl.findOne({});
            if (eotw) employeeOfTheWeek = eotw;
        } catch (e) {}
    }

    const formattedDrivers = accountsDatabase.map(m => {
        const userJobs = allJobsHistory.filter(j => isDriverMatch(j.driver, m.username));
        return {
            username: m.username, role: m.role, color: getRoleColor(m.role), rank: getRoleRank(m.role), isDev: !!m.isDev,
            deliveries: userJobs.length,
            distance: `${userJobs.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
            earnings: `€ ${userJobs.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            userJobs: userJobs.slice(0, 15),
            badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
        };
    }).sort((a, b) => b.rank - a.rank);

    res.json({
        deliveries: totalDeliveries.toString(),
        distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
        companyEarnings: `€ ${totalCompanyEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
        drivers: formattedDrivers.filter(d => !d.isDev).length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: allJobsHistory.slice(0, 10),
        gallery: [], badges: customBadges, // Gallery is leeggemaakt voor maximale snelheid!
        announcements: announcementsList, applications: [],
        infoList, convoysList, employeeOfTheWeek, socials: socialsList
    });
});

app.get('/api/gallery', (req, res) => {
    res.json([]); // Uitgeschakeld voor snelheid
});

if (DISCORD_BOT_TOKEN) clientBot.login(DISCORD_BOT_TOKEN).catch(err => {});

app.listen(PORT, () => console.log(`🚀 Supersnelle server actief op poort ${PORT}`));
