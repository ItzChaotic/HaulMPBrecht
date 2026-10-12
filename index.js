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

function saveAccounts() {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsDatabase, null, 2));
}

let galleryPhotos = [
    { id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" }
];
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
    const clean = str.replace(/[^0-9\,\.]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
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
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `Wk ${weekNo}`;
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

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
    let contentText = message.content || "Nieuwe sollicitatie ingediend via Discord.";
    if (message.embeds && message.embeds.length > 0) {
        contentText = message.embeds[0].description || message.embeds[0].title || contentText;
    }

    const appObj = {
        id: "app-" + message.id,
        applicant: applicantName,
        content: contentText,
        status: "open",
        date: new Date(message.createdTimestamp || Date.now()).toLocaleDateString('nl-NL'),
        link: "https://vtc.haulmp.com/Brecht#applications"
    };

    if (!applicationsList.some(a => a.id === appObj.id)) {
        applicationsList.unshift(appObj);
        saveApplications();
    }
}

function parseAndAddJob(message) {
    let from = '', to = '', driver = '', cargo = 'Vracht', distanceStr = '0 km', paidAmount = 0;
    let timestamp = message.createdTimestamp || Date.now();

    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const title = embed.title || '';
        const description = embed.description || '';
        
        if (title.includes('→') || title.includes('->')) {
            const parts = title.split(title.includes('→') ? '→' : '->');
            from = cleanText(parts[0]); to = cleanText(parts[1]);
        } else if (description.includes('→') || description.includes('->')) {
            const parts = description.split(description.includes('→') ? '→' : '->');
            from = cleanText(parts[0]); to = cleanText(parts[1]);
        }

        embed.fields?.forEach(f => {
            const fieldName = (f.name || '').toLowerCase();
            if (fieldName.includes('driver')) driver = cleanText(f.value);
            if (fieldName.includes('distance')) distanceStr = cleanText(f.value);
            if (fieldName.includes('paid')) paidAmount = parseCurrency(f.value);
        });
    }

    if (!from || !to) return;
    if (!driver) driver = cleanText(message.author.username);

    const kmAmount = parseInt(distanceStr.replace(/\D/g, ''), 10) || 0;
    if (paidAmount === 0 && kmAmount > 0) paidAmount = kmAmount * 35;

    const jobObj = {
        id: message.id || "job-" + Date.now() + "-" + Math.random(),
        from, to, driver, cargo,
        distance: `${kmAmount.toLocaleString('nl-NL')} km`,
        kmAmount, paidAmount, timestamp,
        weekKey: getISOWeekKey(timestamp),
        dateFormatted: new Date(timestamp).toLocaleDateString('nl-NL')
    };

    if (!allJobsHistory.some(j => j.id === jobObj.id)) {
        allJobsHistory.push(jobObj);
    }
}

async function fetchAllHistoricalDiscordLogs() {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (channel) {
            let lastId = undefined; let totalFetched = 0; allJobsHistory = [];
            while (totalFetched < 500) {
                const options = { limit: 100 }; if (lastId) options.before = lastId;
                const messages = await channel.messages.fetch(options);
                if (messages.size === 0) break;
                messages.forEach(msg => parseAndAddJob(msg));
                lastId = messages.last().id;
                totalFetched += messages.size;
                if (messages.size < 100) break;
            }
            allJobsHistory.sort((a, b) => b.timestamp - a.timestamp);
        }

        const appChannel = await client.channels.fetch(DISCORD_APPLICATIONS_CHANNEL_ID);
        if (appChannel) {
            const appMessages = await appChannel.messages.fetch({ limit: 30 });
            appMessages.forEach(msg => parseAndAddApplication(msg));
        }
    } catch (err) {}
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const account = accountsDatabase.find(
        acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password
    );

    if (!account) return res.status(401).json({ success: false, message: 'Onjuiste gebruikersnaam of wachtwoord!' });

    res.json({
        success: true,
        username: account.username,
        role: account.role,
        color: getRoleColor(account.role),
        canManageBadges: canManageBadges(account.role),
        canManageStaff: canManageStaff(account.role)
    });
});

app.get('/api/haulmp', (req, res) => {
    const totalDeliveries = allJobsHistory.length;
    const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
    const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidAmount, 0);

    const formattedDrivers = accountsDatabase.map(m => {
        const userJobs = allJobsHistory.filter(j => isDriverMatch(j.driver, m.username));
        const userKm = userJobs.reduce((acc, curr) => acc + curr.kmAmount, 0);
        const userEarnings = userJobs.reduce((acc, curr) => acc + curr.paidAmount, 0);
        
        return {
            username: m.username,
            role: m.role,
            color: getRoleColor(m.role),
            isDev: !!m.isDev,
            deliveries: userJobs.length,
            distance: `${userKm.toLocaleString('nl-NL')} km`,
            earnings: `€ ${userEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            userJobs: userJobs.slice(0, 15),
            badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
        };
    });

    const weeklyChartData = {};
    allJobsHistory.forEach(j => {
        const w = j.weekKey || 'Week';
        if (!weeklyChartData[w]) weeklyChartData[w] = { week: w, company: 0, drivers: {} };
        weeklyChartData[w].company += j.paidAmount;
        
        const driverClean = j.driver.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!weeklyChartData[w].drivers[driverClean]) weeklyChartData[w].drivers[driverClean] = 0;
        weeklyChartData[w].drivers[driverClean] += j.paidAmount;
    });

    res.json({
        deliveries: totalDeliveries.toString(),
        distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
        companyEarnings: `€ ${totalCompanyEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
        drivers: formattedDrivers.filter(d => !d.isDev).length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: allJobsHistory.slice(0, 10),
        absence: absenceList,
        gallery: galleryPhotos,
        badges: customBadges,
        announcements: announcementsList,
        applications: applicationsList,
        infoList,
        convoysList,
        employeeOfTheWeek,
        weeklyChartData: Object.values(weeklyChartData).reverse().slice(0, 8)
    });
});

app.post('/api/applications/complete', (req, res) => {
    const { appId } = req.body;
    const item = applicationsList.find(a => a.id === appId);
    if (item) {
        item.status = "completed";
        saveApplications();
        return res.json({ success: true, message: "Sollicitatie afgerond!" });
    }
    res.status(404).json({ success: false, message: "Sollicitatie niet gevonden." });
});

app.post('/api/badges', (req, res) => {
    const { title, targetUser, username } = req.body;
    if (!title || !targetUser) return res.status(400).json({ success: false, message: "Vul alle velden in." });
    customBadges.push({
        id: "badge-" + Date.now(),
        title: title.trim(),
        targetUser: targetUser.trim(),
        awardedBy: username,
        date: new Date().toLocaleDateString('nl-NL')
    });
    saveBadges();
    res.json({ success: true, message: "Badge toegekend!" });
});

app.post('/api/badges/delete', (req, res) => {
    const { badgeId } = req.body;
    customBadges = customBadges.filter(b => b.id !== badgeId);
    saveBadges();
    res.json({ success: true, message: "Badge ingetrokken!" });
});

app.post('/api/info', (req, res) => {
    const { title, content, link, username } = req.body;
    infoList.unshift({
        id: "info-" + Date.now(), title, content, link, author: username, date: new Date().toLocaleDateString('nl-NL')
    });
    saveInfo();
    res.json({ success: true, message: "Informatie gepubliceerd!" });
});

app.delete('/api/info/:id', (req, res) => {
    infoList = infoList.filter(i => i.id !== req.params.id);
    saveInfo();
    res.json({ success: true, message: "Informatie verwijderd." });
});

app.post('/api/convoys', (req, res) => {
    const { title, date, time, server, route, details, username } = req.body;
    convoysList.unshift({
        id: "conv-" + Date.now(), title, date, time, server, route, details, author: username
    });
    saveConvoys();
    res.json({ success: true, message: "Konvooi ingepland!" });
});

app.delete('/api/convoys/:id', (req, res) => {
    convoysList = convoysList.filter(c => c.id !== req.params.id);
    saveConvoys();
    res.json({ success: true, message: "Konvooi verwijderd." });
});

app.post('/api/eotw', (req, res) => {
    const { targetUser, reason, username } = req.body;
    employeeOfTheWeek = { username: targetUser, reason, setBy: username };
    saveEotw();
    res.json({ success: true, message: "Chauffeur van de week ingesteld!" });
});

app.post('/api/staff/update-password', (req, res) => {
    const { targetUser, newPassword, adminUser } = req.body;
    const adminAcc = accountsDatabase.find(d => d.username.toLowerCase() === (adminUser || '').toLowerCase());
    if (!adminAcc || !canManageStaff(adminAcc.role)) return res.status(403).json({ success: false, message: 'Geen rechten.' });

    const targetAcc = accountsDatabase.find(d => d.username.toLowerCase() === (targetUser || '').toLowerCase());
    if (targetAcc) {
        targetAcc.password = newPassword.trim();
        saveAccounts();
        return res.json({ success: true, message: `Wachtwoord gewijzigd!` });
    }
    res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });
});

app.post('/api/staff/add', (req, res) => {
    const { username, role } = req.body;
    if (accountsDatabase.some(d => d.username.toLowerCase() === username.toLowerCase().trim())) {
        return res.status(400).json({ success: false, message: 'Bestaat al.' });
    }
    const generatedPassword = "Brecht" + Math.floor(1000 + Math.random() * 9000);
    accountsDatabase.push({ username: username.trim(), password: generatedPassword, role: role.trim() });
    saveAccounts();
    res.json({ success: true, message: `Toegevoegd! Wachtwoord: ${generatedPassword}` });
});

app.post('/api/staff/update-role', (req, res) => {
    const { targetUser, newRole } = req.body;
    const targetAcc = accountsDatabase.find(d => d.username.toLowerCase() === targetUser.toLowerCase());
    if (targetAcc) { targetAcc.role = newRole.trim(); saveAccounts(); return res.json({ success: true, message: 'Rol gewijzigd!' }); }
    res.status(404).json({ success: false, message: 'Niet gevonden.' });
});

app.delete('/api/staff/:targetUser', (req, res) => {
    accountsDatabase = accountsDatabase.filter(d => d.username.toLowerCase() !== req.params.targetUser.toLowerCase());
    saveAccounts();
    res.json({ success: true, message: 'Ontslagen.' });
});

app.post('/api/gallery', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Geen bestand geselecteerd.' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${b64}`;
    
    galleryPhotos.unshift({ 
        id: "photo-" + Date.now(), 
        url: dataUrl, 
        uploadedBy: req.body.username || "Chauffeur", 
        date: new Date().toLocaleDateString('nl-NL') 
    });
    saveGallery();
    res.json({ success: true, message: 'Foto succesvol geüpload!' });
});

app.delete('/api/gallery/:id', (req, res) => {
    galleryPhotos = galleryPhotos.filter(p => p.id !== req.params.id);
    saveGallery();
    res.json({ success: true, message: 'Verwijderd.' });
});

if (DISCORD_BOT_TOKEN) client.login(DISCORD_BOT_TOKEN);

app.listen(PORT, () => console.log(`Server actief op poort ${PORT}`));
