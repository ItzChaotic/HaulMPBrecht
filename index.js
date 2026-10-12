const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }
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
const DISCORD_APPLICATIONS_CHANNEL_ID = '1558075393729363968';

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const GALLERY_FILE = path.join(__dirname, 'gallery.json');
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'announcements.json');
const APPLICATIONS_FILE = path.join(__dirname, 'applications.json');
const INFO_FILE = path.join(__dirname, 'info.json');
const CONVOYS_FILE = path.join(__dirname, 'convoys.json');
const BADGES_FILE = path.join(__dirname, 'badges.json');
const EOTW_FILE = path.join(__dirname, 'eotw.json');

let defaultAccounts = [
    { username: "DEV ACCOUNT", password: "DEVACC123", role: "Directeur", isDev: true },
    { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur" },
    { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

let accountsDatabase = defaultAccounts;
if (fs.existsSync(ACCOUNTS_FILE)) {
    try { 
        const loaded = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
        if (Array.isArray(loaded) && loaded.length > 0) {
            accountsDatabase = loaded;
            if (!accountsDatabase.some(a => a.username === "DEV ACCOUNT")) {
                accountsDatabase.unshift({ username: "DEV ACCOUNT", password: "DEVACC123", role: "Directeur", isDev: true });
            }
        }
    } catch (e) {}
} else {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(defaultAccounts, null, 2));
}

function saveAccounts() { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsDatabase, null, 2)); }

let galleryPhotos = [{ id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" }];
if (fs.existsSync(GALLERY_FILE)) { try { galleryPhotos = JSON.parse(fs.readFileSync(GALLERY_FILE, 'utf8')); } catch (e) {} }
function saveGallery() { fs.writeFileSync(GALLERY_FILE, JSON.stringify(galleryPhotos, null, 2)); }

let announcementsList = [];
if (fs.existsSync(ANNOUNCEMENTS_FILE)) { try { announcementsList = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8')); } catch (e) {} }
function saveAnnouncements() { fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(announcementsList, null, 2)); }

let applicationsList = [];
if (fs.existsSync(APPLICATIONS_FILE)) { try { applicationsList = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8')); } catch (e) {} }
function saveApplications() { fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(applicationsList, null, 2)); }

let infoList = [];
if (fs.existsSync(INFO_FILE)) { try { infoList = JSON.parse(fs.readFileSync(INFO_FILE, 'utf8')); } catch (e) {} }
function saveInfo() { fs.writeFileSync(INFO_FILE, JSON.stringify(infoList, null, 2)); }

let convoysList = [];
if (fs.existsSync(CONVOYS_FILE)) { try { convoysList = JSON.parse(fs.readFileSync(CONVOYS_FILE, 'utf8')); } catch (e) {} }
function saveConvoys() { fs.writeFileSync(CONVOYS_FILE, JSON.stringify(convoysList, null, 2)); }

let customBadges = [];
if (fs.existsSync(BADGES_FILE)) { try { customBadges = JSON.parse(fs.readFileSync(BADGES_FILE, 'utf8')); } catch (e) {} }
function saveBadges() { fs.writeFileSync(BADGES_FILE, JSON.stringify(customBadges, null, 2)); }

let employeeOfTheWeek = { username: "MJGamerNL", reason: "Uitstekende inzet!", setBy: "Directie" };
if (fs.existsSync(EOTW_FILE)) { try { employeeOfTheWeek = JSON.parse(fs.readFileSync(EOTW_FILE, 'utf8')); } catch (e) {} }
function saveEotw() { fs.writeFileSync(EOTW_FILE, JSON.stringify(employeeOfTheWeek, null, 2)); }

let absenceList = [];
let allJobsHistory = [];

function cleanText(text) { return text ? text.replace(/[\*\_\`]/g, '').trim() : ''; }
function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9\,\.]/g, '').replace(',', '.')) || 0;
}

function getRoleColor(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('chauffeur in opleiding')) return 'gray';
    if (r.includes('onder directeur')) return 'orange';
    if (r.includes('directeur')) return 'red';
    if (r.includes('management')) return 'yellow';
    if (r.includes('leidinggevende')) return 'green';
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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.on('clientReady', () => {
    console.log(`Discord Bot ingelogd als ${client.user.tag}`);
    setTimeout(fetchAllHistoricalDiscordLogs, 1000);
});

client.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) parseAndAddJob(message);
    else if (message.channelId === DISCORD_APPLICATIONS_CHANNEL_ID) parseAndAddApplication(message);
});

function parseAndAddApplication(message) {
    const applicantName = message.author ? message.author.username : "Sollicitant";
    let contentText = message.content || "Nieuwe sollicitatie.";
    if (message.embeds?.[0]) contentText = message.embeds[0].description || message.embeds[0].title || contentText;

    const appObj = { id: "app-" + message.id, applicant: applicantName, content: contentText, status: "open", date: new Date(message.createdTimestamp || Date.now()).toLocaleDateString('nl-NL'), link: "https://vtc.haulmp.com/Brecht#applications" };
    if (!applicationsList.some(a => a.id === appObj.id)) { applicationsList.unshift(appObj); saveApplications(); }
}

function parseAndAddJob(message) {
    let from = '', to = '', driver = '', cargo = 'Vracht', distanceStr = '0 km', paidAmount = 0;
    let timestamp = message.createdTimestamp || Date.now();

    if (message.embeds?.[0]) {
        const embed = message.embeds[0];
        const title = embed.title || ''; const desc = embed.description || '';
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
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
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

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const account = accountsDatabase.find(acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password);
    if (!account) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });
    res.json({ success: true, username: account.username, role: account.role, color: getRoleColor(account.role), canManageBadges: canManageBadges(account.role), canManageStaff: canManageStaff(account.role) });
});

app.get('/api/haulmp', (req, res) => {
    const totalDeliveries = allJobsHistory.length;
    const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
    const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidAmount, 0);

    const formattedDrivers = accountsDatabase.map(m => {
        const userJobs = allJobsHistory.filter(j => isDriverMatch(j.driver, m.username));
        return {
            username: m.username, role: m.role, color: getRoleColor(m.role), isDev: !!m.isDev,
            deliveries: userJobs.length,
            distance: `${userJobs.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
            earnings: `€ ${userJobs.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            userJobs: userJobs.slice(0, 15),
            badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
        };
    });

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
        absence: absenceList, gallery: galleryPhotos, badges: customBadges,
        announcements: announcementsList, applications: applicationsList,
        infoList, convoysList, employeeOfTheWeek,
        weeklyChartData: Object.values(weeklyChartData).reverse().slice(0, 8)
    });
});

app.post('/api/applications/complete', (req, res) => {
    const item = applicationsList.find(a => a.id === req.body.appId);
    if (item) { item.status = "completed"; saveApplications(); return res.json({ success: true }); }
    res.status(404).json({ success: false });
});

app.post('/api/badges', (req, res) => {
    const { title, targetUser } = req.body;
    if (!title || !targetUser) return res.status(400).json({ success: false });
    customBadges.push({ id: "badge-" + Date.now(), title: title.trim(), targetUser: targetUser.trim(), date: new Date().toLocaleDateString('nl-NL') });
    saveBadges();
    res.json({ success: true });
});

app.post('/api/badges/delete', (req, res) => {
    customBadges = customBadges.filter(b => b.id !== req.body.badgeId);
    saveBadges();
    res.json({ success: true });
});

app.post('/api/info', (req, res) => {
    infoList.unshift({ id: "info-" + Date.now(), ...req.body, date: new Date().toLocaleDateString('nl-NL') });
    saveInfo(); res.json({ success: true });
});

app.post('/api/convoys', (req, res) => {
    convoysList.unshift({ id: "conv-" + Date.now(), ...req.body });
    saveConvoys(); res.json({ success: true });
});

app.post('/api/eotw', (req, res) => {
    employeeOfTheWeek = { username: req.body.targetUser, reason: req.body.reason, setBy: req.body.username };
    saveEotw(); res.json({ success: true });
});

app.post('/api/staff/update-password', (req, res) => {
    const target = accountsDatabase.find(d => d.username.toLowerCase() === req.body.targetUser.toLowerCase());
    if (target) { target.password = req.body.newPassword.trim(); saveAccounts(); return res.json({ success: true }); }
    res.status(404).json({ success: false });
});

app.post('/api/staff/add', (req, res) => {
    if (accountsDatabase.some(d => d.username.toLowerCase() === req.body.username.toLowerCase().trim())) return res.status(400).json({ success: false });
    const pw = "Brecht" + Math.floor(1000 + Math.random() * 9000);
    accountsDatabase.push({ username: req.body.username.trim(), password: pw, role: req.body.role.trim() });
    saveAccounts(); res.json({ success: true, message: pw });
});

app.post('/api/staff/update-role', (req, res) => {
    const target = accountsDatabase.find(d => d.username.toLowerCase() === req.body.targetUser.toLowerCase());
    if (target) { target.role = req.body.newRole.trim(); saveAccounts(); return res.json({ success: true }); }
    res.status(404).json({ success: false });
});

app.delete('/api/staff/:targetUser', (req, res) => {
    accountsDatabase = accountsDatabase.filter(d => d.username.toLowerCase() !== req.params.targetUser.toLowerCase());
    saveAccounts(); res.json({ success: true });
});

app.post('/api/gallery', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    galleryPhotos.unshift({ id: "photo-" + Date.now(), url: `data:${req.file.mimetype};base64,${Buffer.from(req.file.buffer).toString('base64')}`, uploadedBy: req.body.username || "Chauffeur", date: new Date().toLocaleDateString('nl-NL') });
    saveGallery(); res.json({ success: true });
});

if (DISCORD_BOT_TOKEN) client.login(DISCORD_BOT_TOKEN);
app.listen(PORT, () => console.log(`Server actief op poort ${PORT}`));
