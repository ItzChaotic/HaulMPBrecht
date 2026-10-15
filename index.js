const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Verhoogd limiet licht gehouden dankzij client-side compressie
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
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

let db, accountsColl, galleryColl, announcementsColl, applicationsColl, infoColl, convoysColl, badgesColl, eotwColl, socialsColl, jobsColl;
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

async function connectDB() {
    if (!MONGO_URI) { console.log("Geen MONGO_URI ingesteld."); return; }
    try {
        const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
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
        jobsColl = db.collection('jobs');

        isConnected = true;
        console.log("Verbonden met MongoDB Atlas!");

        const count = await accountsColl.countDocuments();
        if (count === 0) await accountsColl.insertMany(defaultAccounts);
    } catch (err) {
        console.error("MongoDB verbinding mislukt:", err.message);
    }
}
connectDB();

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
    if (r.includes('senior medewerker')) return 4;
    if (r.includes('medewerker') && !r.includes('senior') && !r.includes('junior')) return 3;
    if (r.includes('junior medewerker')) return 2;
    if (r.includes('chauffeur in opleiding')) return 1;
    return 0;
}

function getRoleColor(role) {
    const r = (role || '').toLowerCase().trim();
    if (r.includes('onder directeur')) return 'orange';
    if (r.includes('directeur')) return 'red';
    if (r.includes('management')) return 'yellow';
    if (r.includes('leidinggevende')) return 'green';
    if (r.includes('senior medewerker')) return 'blue';
    if (r.includes('medewerker')) return 'purple';
    if (r.includes('junior medewerker')) return 'cyan';
    if (r.includes('chauffeur in opleiding')) return 'gray';
    return 'gray';
}

function canManageBadges(role) {
    const r = (role || '').toLowerCase();
    return r.includes('directeur') || r.includes('management') || r.includes('leidinggevende');
}

function canManageStaff(role) {
    const r = (role || '').toLowerCase();
    return r.includes('directeur') || r.includes('onder directeur');
}

function canDeleteContent(role) {
    const r = (role || '').toLowerCase();
    return r.includes('directeur') || r.includes('onder directeur') || r.includes('management');
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

clientBot.on('clientReady', () => { console.log(`Discord Bot ingelogd als ${clientBot.user.tag}`); });
clientBot.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) parseAndAddJob(message);
    else if (message.channelId === DISCORD_APPLICATIONS_CHANNEL_ID) parseAndAddApplication(message);
});

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

async function parseAndAddJob(message) {
    let from = '', to = '', driver = '', distanceStr = '0 km', paidAmount = 0;
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
    const jobObj = { id: message.id || "job-" + Date.now(), from, to, driver, distance: `${kmAmount.toLocaleString('nl-NL')} km`, kmAmount, paidAmount, timestamp, weekKey: getISOWeekKey(timestamp), dateFormatted: new Date(timestamp).toLocaleDateString('nl-NL') };
    if (isConnected && jobsColl) await jobsColl.updateOne({ id: jobObj.id }, { $set: jobObj }, { upsert: true });
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    let accountsDatabase = isConnected && accountsColl ? await accountsColl.find({}).toArray() : defaultAccounts;
    const account = accountsDatabase.find(acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password);
    if (!account) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });
    res.json({ 
        success: true, username: account.username, role: account.role, color: getRoleColor(account.role), 
        avatarUrl: account.avatarUrl || '', canManageBadges: canManageBadges(account.role), 
        canManageStaff: canManageStaff(account.role), canDelete: canDeleteContent(account.role)
    });
});

// SNEL HOOFD-ENDPOINT (zonder zware foto's)
app.get('/api/haulmp', async (req, res) => {
    let allJobsHistory = isConnected && jobsColl ? await jobsColl.find({}).sort({ timestamp: -1 }).limit(100).toArray() : [];
    let accountsDatabase = isConnected && accountsColl ? await accountsColl.find({}).toArray() : defaultAccounts;
    let customBadges = isConnected && badgesColl ? await badgesColl.find({}).toArray() : [];
    let announcementsList = isConnected && announcementsColl ? await announcementsColl.find({}).sort({ _id: -1 }).toArray() : [];
    let applicationsList = isConnected && applicationsColl ? await applicationsColl.find({}).toArray() : [];
    let infoList = isConnected && infoColl ? await infoColl.find({}).sort({ _id: -1 }).toArray() : [];
    let convoysList = isConnected && convoysColl ? await convoysColl.find({}).sort({ _id: -1 }).toArray() : [];
    let socialsList = isConnected && socialsColl ? await socialsColl.find({}).sort({ _id: -1 }).toArray() : [];
    let employeeOfTheWeek = await eotwColl?.findOne({}) || { username: "MJGamerNL", reason: "Uitstekende inzet!" };

    let formattedDrivers = accountsDatabase.map(m => {
        const userJobs = allJobsHistory.filter(j => isDriverMatch(j.driver, m.username));
        return {
            username: m.username, role: m.role, weight: getRoleWeight(m.role), color: getRoleColor(m.role), isDev: !!m.isDev,
            avatarUrl: m.avatarUrl || '', deliveries: userJobs.length,
            distance: `${userJobs.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
            earnings: `€ ${userJobs.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
        };
    });
    formattedDrivers.sort((a, b) => b.weight - a.weight);

    const weeklyChartData = {};
    allJobsHistory.forEach(j => {
        const w = j.weekKey || 'Wk 1';
        if (!weeklyChartData[w]) weeklyChartData[w] = { week: w, company: 0, drivers: {} };
        weeklyChartData[w].company += j.paidAmount;
        weeklyChartData[w].drivers[j.driver.toLowerCase().replace(/[^a-z0-9]/g, '')] = (weeklyChartData[w].drivers[j.driver.toLowerCase().replace(/[^a-z0-9]/g, '')] || 0) + j.paidAmount;
    });

    res.json({
        deliveries: allJobsHistory.length.toString(),
        distance: `${allJobsHistory.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
        companyEarnings: `€ ${allJobsHistory.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
        drivers: formattedDrivers.filter(d => !d.isDev).length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: allJobsHistory.slice(0, 10),
        badges: customBadges, announcements: announcementsList, applications: applicationsList,
        infoList, convoysList, socialsList, employeeOfTheWeek,
        weeklyChartData: Object.values(weeklyChartData).reverse()
    });
});

// APARTE LAZY-LOAD ENDPOINT VOOR FOTO'S
app.get('/api/gallery', async (req, res) => {
    let galleryPhotos = isConnected && galleryColl ? await galleryColl.find({}).sort({ _id: -1 }).limit(30).toArray() : [];
    res.json(galleryPhotos);
});

app.post('/api/staff/upload-pfp', async (req, res) => {
    const { targetUser, pfp } = req.body;
    if (!targetUser || !pfp) return res.status(400).json({ success: false });
    if (isConnected && accountsColl) await accountsColl.updateOne({ username: { $regex: new RegExp(`^${targetUser}$`, 'i') } }, { $set: { avatarUrl: pfp } });
    res.json({ success: true, avatarUrl: pfp });
});

app.post('/api/gallery', async (req, res) => {
    const { pfp, username } = req.body;
    if (!pfp) return res.status(400).json({ success: false });
    const photoObj = { id: "photo-" + Date.now(), url: pfp, uploadedBy: username || "Chauffeur", date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && galleryColl) await galleryColl.insertOne(photoObj);
    res.json({ success: true });
});

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

app.post('/api/info', async (req, res) => {
    const infoObj = { id: "info-" + Date.now(), ...req.body, date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && infoColl) await infoColl.insertOne(infoObj);
    res.json({ success: true });
});

app.delete('/api/info/:id', async (req, res) => {
    if (isConnected && infoColl) await infoColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.post('/api/convoys', async (req, res) => {
    const convObj = { id: "conv-" + Date.now(), ...req.body };
    if (isConnected && convoysColl) await convoysColl.insertOne(convObj);
    res.json({ success: true });
});

app.delete('/api/convoys/:id', async (req, res) => {
    if (isConnected && convoysColl) await convoysColl.deleteOne({ id: req.params.id });
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

app.delete('/api/announcements/:id', async (req, res) => {
    if (isConnected && announcementsColl) await announcementsColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.post('/api/socials', async (req, res) => {
    const { platform, url, username } = req.body;
    const socialObj = { id: "soc-" + Date.now(), platform: platform.trim(), url: url.trim(), addedBy: username || 'Admin' };
    if (isConnected && socialsColl) await socialsColl.insertOne(socialObj);
    res.json({ success: true });
});

app.delete('/api/socials/:id', async (req, res) => {
    if (isConnected && socialsColl) await socialsColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.post('/api/staff/update-password', async (req, res) => {
    if (isConnected && accountsColl) await accountsColl.updateOne({ username: { $regex: new RegExp(`^${req.body.targetUser}$`, 'i') } }, { $set: { password: req.body.newPassword.trim() } });
    res.json({ success: true });
});

app.post('/api/staff/add', async (req, res) => {
    const pw = "Brecht" + Math.floor(1000 + Math.random() * 9000);
    if (isConnected && accountsColl) await accountsColl.insertOne({ username: req.body.username.trim(), password: pw, role: req.body.role.trim() });
    res.json({ success: true, message: pw });
});

app.post('/api/staff/update-role', async (req, res) => {
    if (isConnected && accountsColl) await accountsColl.updateOne({ username: { $regex: new RegExp(`^${req.body.targetUser}$`, 'i') } }, { $set: { role: req.body.newRole.trim() } });
    res.json({ success: true });
});

app.delete('/api/staff/:targetUser', async (req, res) => {
    if (isConnected && accountsColl) await accountsColl.deleteOne({ username: { $regex: new RegExp(`^${req.params.targetUser}$`, 'i') } });
    res.json({ success: true });
});

if (DISCORD_BOT_TOKEN) clientBot.login(DISCORD_BOT_TOKEN).catch(err => {});
app.listen(PORT, () => console.log(`Server actief op poort ${PORT}`));
