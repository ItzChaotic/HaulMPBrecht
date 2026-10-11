const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
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

let accountsDatabase = [
    { username: "DEV", password: "DEVACC123", role: "Directeur", isDev: true },
    { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur" },
    { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

if (fs.existsSync(ACCOUNTS_FILE)) {
    try { 
        const loaded = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
        // Zorg dat het dev account er altijd in staat
        if (!loaded.some(a => a.username === "DEV")) {
            loaded.unshift({ username: "DEV", password: "DEVACC123", role: "Directeur", isDev: true });
        }
        accountsDatabase = loaded;
    } catch (e) {}
}

function saveAccounts() {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsDatabase, null, 2));
}

let galleryPhotos = [
    { id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" },
    { id: "photo-2", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/Schermafbeelding%202026-10-08%20203105.png", uploadedBy: "ItzChaotic_", date: "10-10-2026" }
];

if (fs.existsSync(GALLERY_FILE)) {
    try { galleryPhotos = JSON.parse(fs.readFileSync(GALLERY_FILE, 'utf8')); } catch (e) {}
}

function saveGallery() {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify(galleryPhotos, null, 2));
}

let announcementsList = [
    { id: "ann-1", title: "Welkom op het vernieuwde personeelsportaal!", content: "Vanaf heden zijn alle functies zoals inkomsten, ritten-statistieken en foto's hier te vinden.", author: "Directie", date: "11-10-2026" }
];

if (fs.existsSync(ANNOUNCEMENTS_FILE)) {
    try { announcementsList = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8')); } catch (e) {}
}

function saveAnnouncements() {
    fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(announcementsList, null, 2));
}

let applicationsList = [];
if (fs.existsSync(APPLICATIONS_FILE)) {
    try { applicationsList = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8')); } catch (e) {}
}

function saveApplications() {
    fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(applicationsList, null, 2));
}

let absenceList = [];
let customBadges = []; 
let allJobsHistory = [];

function cleanText(text) {
    if (!text) return '';
    return text.replace(/[\*\_\`]/g, '').trim();
}

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
    if (!role) return false;
    const r = role.toLowerCase();
    return r.includes('directeur') || r.includes('management') || r.includes('leidinggevende');
}

function canManageStaff(role) {
    if (!role) return false;
    const r = role.toLowerCase();
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
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('clientReady', () => {
    console.log(`Discord Bot ingelogd als ${client.user.tag}`);
    setTimeout(fetchAllHistoricalDiscordLogs, 1000);
});

client.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) {
        parseAndAddJob(message);
    } else if (message.channelId === DISCORD_APPLICATIONS_CHANNEL_ID) {
        parseAndAddApplication(message);
    }
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
            from = cleanText(parts[0]);
            to = cleanText(parts[1]);
        } else if (description.includes('→') || description.includes('->')) {
            const parts = description.split(description.includes('→') ? '→' : '->');
            from = cleanText(parts[0]);
            to = cleanText(parts[1]);
        }

        if (description) {
            const descLines = description.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (descLines.length > 0 && !descLines[0].toLowerCase().includes('delivery completed')) {
                cargo = cleanText(descLines[0]);
            }
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
            let lastId = undefined;
            let totalFetched = 0;
            allJobsHistory = [];
            while (totalFetched < 500) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;
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
    } catch (err) {
        console.error('Fout bij ophalen Discord historie:', err.message);
    }
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const account = accountsDatabase.find(
        acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password
    );

    if (!account) {
        return res.status(401).json({ success: false, message: 'Onjuiste gebruikersnaam of wachtwoord!' });
    }

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
        drivers: formattedDrivers.length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: allJobsHistory.slice(0, 10),
        absence: absenceList,
        gallery: galleryPhotos,
        badges: customBadges,
        announcements: announcementsList,
        applications: applicationsList,
        weeklyChartData: Object.values(weeklyChartData).reverse().slice(0, 8)
    });
});

app.post('/api/announcements', (req, res) => {
    const { title, content, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !canManageStaff(account.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten.' });
    }

    if (!title || !content) return res.status(400).json({ success: false, message: 'Vul titel en inhoud in.' });

    const newAnn = {
        id: "ann-" + Date.now(),
        title: title.trim(),
        content: content.trim(),
        author: username,
        date: new Date().toLocaleDateString('nl-NL')
    };

    announcementsList.unshift(newAnn);
    saveAnnouncements();
    res.json({ success: true, message: 'Aankondiging geplaatst!' });
});

app.delete('/api/announcements/:id', (req, res) => {
    announcementsList = announcementsList.filter(a => a.id !== req.params.id);
    saveAnnouncements();
    res.json({ success: true, message: 'Aankondiging verwijderd.' });
});

app.post('/api/staff/update-password', (req, res) => {
    const { targetUser, newPassword, adminUser } = req.body;
    const adminAcc = accountsDatabase.find(d => d.username.toLowerCase() === (adminUser || '').toLowerCase());

    if (!adminAcc || !canManageStaff(adminAcc.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten om wachtwoorden aan te passen.' });
    }

    const targetAcc = accountsDatabase.find(d => d.username.toLowerCase() === (targetUser || '').toLowerCase());
    if (targetAcc) {
        targetAcc.password = newPassword.trim();
        saveAccounts();
        return res.json({ success: true, message: `Wachtwoord voor ${targetAcc.username} succesvol opgeslagen!` });
    }
    res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });
});

app.post('/api/absence', (req, res) => {
    const { username, fromDate, toDate, reason } = req.body;
    absenceList.unshift({
        id: "abs-" + Date.now(),
        username, fromDate, toDate,
        reason: reason || "Vakantie", status: "In behandeling",
        dateSubmitted: new Date().toLocaleDateString('nl-NL')
    });
    res.json({ success: true, message: 'Afwezigheid ingediend!' });
});

app.post('/api/absence/status', (req, res) => {
    const item = absenceList.find(a => a.id === req.body.absenceId);
    if (item) { item.status = req.body.newStatus; return res.json({ success: true, message: 'Status bijgewerkt.' }); }
    res.status(404).json({ success: false, message: 'Niet gevonden.' });
});

app.delete('/api/absence/:id', (req, res) => {
    absenceList = absenceList.filter(a => a.id !== req.params.id);
    res.json({ success: true, message: 'Verwijderd.' });
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
    res.json({ success: true, message: 'Foto succesvol geüpload en opgeslagen!' });
});

app.delete('/api/gallery/:id', (req, res) => {
    galleryPhotos = galleryPhotos.filter(p => p.id !== req.params.id);
    saveGallery();
    res.json({ success: true, message: 'Verwijderd.' });
});

app.post('/api/badges', (req, res) => {
    customBadges.push({ id: "badge-" + Date.now(), title: req.body.title.trim(), targetUser: req.body.targetUser.trim(), awardedBy: req.body.username, date: new Date().toLocaleDateString('nl-NL') });
    res.json({ success: true, message: 'Badge toegekend!' });
});

app.post('/api/badges/delete', (req, res) => {
    customBadges = customBadges.filter(b => b.id !== req.body.badgeId);
    res.json({ success: true, message: 'Badge ingetrokken!' });
});

if (DISCORD_BOT_TOKEN) client.login(DISCORD_BOT_TOKEN);

app.listen(PORT, () => console.log(`Server actief op poort ${PORT}`));
