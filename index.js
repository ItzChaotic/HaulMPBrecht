const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient } = require('mongodb');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }
});

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://brechttransport.nl/api/auth/discord/callback';

const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';
const DISCORD_APPLICATIONS_CHANNEL_ID = '1558075393729363968';
const MONGO_URI = process.env.MONGO_URI;

let db, accountsColl, galleryColl, announcementsColl, applicationsColl, infoColl, convoysColl, badgesColl, eotwColl, socialsColl;
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

// Hiërarchie voor automatische sortering (Hoogste functie bovenaan)
const ROLE_RANKING = {
    'directeur': 100,
    'onder directeur': 90,
    'management': 80,
    'leidinggevende': 70,
    'senior medewerker': 60,
    'medewerker': 50,
    'junior medewerker': 40,
    'chauffeur in opleiding': 30
};

function getRoleRank(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('onder directeur')) return 90;
    if (r.includes('directeur')) return 100;
    if (r.includes('management')) return 80;
    if (r.includes('leidinggevende')) return 70;
    if (r.includes('senior medewerker')) return 60;
    if (r.includes('medewerker')) return 50;
    if (r.includes('junior medewerker')) return 40;
    if (r.includes('chauffeur in opleiding')) return 30;
    return 10;
}

// Slimme kleur matching (bevat zoekterm in plaats van een exacte match)
function getRoleColor(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('onder directeur')) return 'orange';
    if (r.includes('directeur')) return 'red';
    if (r.includes('management')) return 'yellow';
    if (r.includes('leidinggevende')) return 'green';
    if (r.includes('senior medewerker')) return 'blue';
    if (r.includes('junior medewerker')) return 'cyan';
    if (r.includes('medewerker')) return 'purple';
    if (r.includes('chauffeur in opleiding')) return 'gray';
    return 'gray';
}

async function connectDB() {
    if (!MONGO_URI) return;
    try {
        const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
        await client.connect();
        db = client.db('brecht_transport');
        
        accountsColl = db.collection('accounts');
        galleryColl = db.collection('gallery');
        announcementsColl = db.collection('announcements');
        applicationsColl = db.collection('applications');
        infoColl = db.collection('info');
        convoysColl = db.collection('convoys');
        badgesColl = db.collection('badges');
        eotwColl = db.collection('eotw');
        socialsColl = db.collection('socials');

        isConnected = true;
        console.log("MongoDB Verbonden!");

        const count = await accountsColl.countDocuments();
        if (count === 0) await accountsColl.insertMany(defaultAccounts);
    } catch (err) {
        console.error("MongoDB Fout:", err.message);
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
    console.log(`Bot Online als ${clientBot.user.tag}`);
    fetchAllHistoricalDiscordLogs();
    fetchApplicationsFromDiscord();
});

clientBot.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) parseAndAddJob(message);
    else if (message.channelId === DISCORD_APPLICATIONS_CHANNEL_ID) parseAndAddApplication(message);
});

async function fetchApplicationsFromDiscord() {
    try {
        const channel = await clientBot.channels.fetch(DISCORD_APPLICATIONS_CHANNEL_ID);
        if (channel) {
            const msgs = await channel.messages.fetch({ limit: 100 });
            msgs.forEach(msg => parseAndAddApplication(msg));
        }
    } catch (e) {}
}

async function parseAndAddApplication(message) {
    const applicantName = message.author ? message.author.username : "Sollicitant";
    let contentText = message.content || "Nieuwe sollicitatie.";
    if (message.embeds?.[0]) contentText = message.embeds[0].description || message.embeds[0].title || contentText;

    const appId = "app-" + message.id;
    if (isConnected && applicationsColl) {
        const exists = await applicationsColl.findOne({ id: appId });
        if (!exists) {
            await applicationsColl.insertOne({
                id: appId, applicant: applicantName, content: contentText, status: "open",
                date: new Date(message.createdTimestamp || Date.now()).toLocaleDateString('nl-NL'),
                link: "https://vtc.haulmp.com/Brecht#applications"
            });
        }
    }
}

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
            while (fetched < 300) {
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
    
    const canManageBadges = ['directeur', 'management', 'leidinggevende'].some(r => account.role.toLowerCase().includes(r));
    const canManageStaff = account.role.toLowerCase().includes('directeur');

    res.json({ success: true, username: account.username, role: account.role, avatar: account.avatar || null, color: getRoleColor(account.role), canManageBadges, canManageStaff });
});

app.get('/api/haulmp', async (req, res) => {
    const totalDeliveries = allJobsHistory.length;
    const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
    const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidAmount, 0);

    let accountsDatabase = defaultAccounts;
    let customBadges = [], galleryPhotos = [], announcementsList = [], applicationsList = [], infoList = [], convoysList = [], socialsList = [];
    let employeeOfTheWeek = { username: "MJGamerNL", reason: "Uitstekende inzet!" };

    if (isConnected && db) {
        try {
            accountsDatabase = await accountsColl.find({}).toArray();
            customBadges = await badgesColl.find({}).toArray();
            galleryPhotos = await galleryColl.find({}).sort({ _id: -1 }).toArray();
            announcementsList = await announcementsColl.find({}).sort({ _id: -1 }).toArray();
            applicationsList = await applicationsColl.find({}).toArray();
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
            avatar: m.avatar || null,
            deliveries: userJobs.length,
            distance: `${userJobs.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
            earnings: `€ ${userJobs.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            userJobs: userJobs.slice(0, 15),
            badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
        };
    }).sort((a, b) => b.rank - a.rank); // Promoties schuiven direct naar boven!

    const weeklyChartData = {};
    allJobsHistory.forEach(j => {
        const w = j.weekKey || 'Wk 1';
        if (!weeklyChartData[w]) weeklyChartData[w] = { week: w, company: 0, drivers: {} };
        weeklyChartData[w].company += j.paidAmount;
        const dc = j.driver.toLowerCase().replace(/[^a-z0-9]/g, '');
        weeklyChartData[w].drivers[dc] = (weeklyChartData[w].drivers[dc] || 0) + j.paidAmount;
    });

    res.json({
        deliveries: totalDeliveries.toString(),
        distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
        companyEarnings: `€ ${totalCompanyEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
        drivers: formattedDrivers.filter(d => !d.isDev).length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: allJobsHistory.slice(0, 10),
        gallery: galleryPhotos, badges: customBadges,
        announcements: announcementsList, applications: applicationsList,
        infoList, convoysList, employeeOfTheWeek, socials: socialsList,
        weeklyChartData: Object.values(weeklyChartData).reverse().slice(0, 8)
    });
});

// DISCORD OAUTH2 LINK FOR PFP
app.get('/api/auth/discord/login', (req, res) => {
    const user = req.query.user;
    const redirectUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify&state=${encodeURIComponent(user)}`;
    res.redirect(redirectUrl);
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.redirect('/?error=no_code');
    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT_URI
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const tokens = await tokenRes.json();
        
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `${tokens.token_type} ${tokens.access_token}` }
        });
        const discordUser = await userRes.json();

        let avatarUrl = `https://cdn.discordapp.com/embed/avatars/0.png`;
        if (discordUser.avatar) {
            avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
        }

        if (isConnected && accountsColl && state) {
            await accountsColl.updateOne(
                { username: { $regex: new RegExp(`^${state}$`, 'i') } },
                { $set: { avatar: avatarUrl, discordId: discordUser.id } }
            );
        }
        res.redirect('/?discord_success=true');
    } catch (e) {
        res.redirect('/?error=oauth_failed');
    }
});

// SOCIALS API
app.post('/api/socials', async (req, res) => {
    const { platform, url, channelName } = req.body;
    const socObj = { id: "soc-" + Date.now(), platform, url, channelName };
    if (isConnected && socialsColl) await socialsColl.insertOne(socObj);
    res.json({ success: true });
});

app.delete('/api/socials/:id', async (req, res) => {
    if (isConnected && socialsColl) await socialsColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

// OVERIGE ACTIES
app.post('/api/applications/complete', async (req, res) => {
    if (isConnected && applicationsColl) await applicationsColl.updateOne({ id: req.body.appId }, { $set: { status: "completed" } });
    res.json({ success: true });
});

app.post('/api/badges', async (req, res) => {
    const { title, targetUser } = req.body;
    const badgeObj = { id: "badge-" + Date.now(), title: title.trim(), targetUser: targetUser.trim(), date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && badgesColl) await badgesColl.insertOne(badgeObj);
    res.json({ success: true });
});

app.post('/api/badges/delete', async (req, res) => {
    if (isConnected && badgesColl) await badgesColl.deleteOne({ id: req.body.badgeId });
    res.json({ success: true });
});

app.post('/api/info', upload.single('file'), async (req, res) => {
    let fileLink = req.body.link || '';
    if (req.file) fileLink = `data:${req.file.mimetype};base64,${Buffer.from(req.file.buffer).toString('base64')}`;
    const infoObj = { id: "info-" + Date.now(), title: req.body.title, content: req.body.content, link: fileLink, fileName: req.file ? req.file.originalname : null, username: req.body.username, date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && infoColl) await infoColl.insertOne(infoObj);
    res.json({ success: true });
});

app.post('/api/convoys', async (req, res) => {
    const convObj = { id: "conv-" + Date.now(), ...req.body };
    if (isConnected && convoysColl) await convoysColl.insertOne(convObj);
    res.json({ success: true });
});

app.post('/api/eotw', async (req, res) => {
    if (isConnected && eotwColl) {
        await eotwColl.deleteMany({});
        await eotwColl.insertOne({ username: req.body.targetUser, reason: req.body.reason, setBy: req.body.username });
    }
    res.json({ success: true });
});

app.post('/api/announcements', async (req, res) => {
    const annObj = { id: "ann-" + Date.now(), ...req.body, date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && announcementsColl) await announcementsColl.insertOne(annObj);
    res.json({ success: true });
});

app.post('/api/staff/update-password', async (req, res) => {
    if (isConnected && accountsColl) {
        await accountsColl.updateOne({ username: { $regex: new RegExp(`^${req.body.targetUser}$`, 'i') } }, { $set: { password: req.body.newPassword.trim() } });
    }
    res.json({ success: true });
});

app.post('/api/staff/add', async (req, res) => {
    const pw = "Brecht" + Math.floor(1000 + Math.random() * 9000);
    const newAcc = { username: req.body.username.trim(), password: pw, role: req.body.role.trim() };
    if (isConnected && accountsColl) await accountsColl.insertOne(newAcc);
    res.json({ success: true, message: pw });
});

app.post('/api/staff/update-role', async (req, res) => {
    if (isConnected && accountsColl) {
        await accountsColl.updateOne({ username: { $regex: new RegExp(`^${req.body.targetUser}$`, 'i') } }, { $set: { role: req.body.newRole.trim() } });
    }
    res.json({ success: true });
});

app.delete('/api/staff/:targetUser', async (req, res) => {
    if (isConnected && accountsColl) {
        await accountsColl.deleteOne({ username: { $regex: new RegExp(`^${req.params.targetUser}$`, 'i') } });
    }
    res.json({ success: true });
});

app.post('/api/gallery', upload.single('photo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    const dataUrl = `data:${req.file.mimetype};base64,${Buffer.from(req.file.buffer).toString('base64')}`;
    const photoObj = { id: "photo-" + Date.now(), url: dataUrl, uploadedBy: req.body.username || "Chauffeur", date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && galleryColl) await galleryColl.insertOne(photoObj);
    res.json({ success: true });
});

if (DISCORD_BOT_TOKEN) clientBot.login(DISCORD_BOT_TOKEN).catch(err => {});

app.listen(PORT, () => console.log(`Server gestart op poort ${PORT}`));
