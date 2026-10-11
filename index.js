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

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const GALLERY_FILE = path.join(__dirname, 'gallery.json');

let accountsDatabase = [
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
        accountsDatabase = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    } catch (e) {
        console.log('Fout bij laden accounts.json');
    }
}

function saveAccounts() {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsDatabase, null, 2));
}

let galleryPhotos = [
    { id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" },
    { id: "photo-2", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/Schermafbeelding%202026-10-08%20203105.png", uploadedBy: "ItzChaotic_", date: "10-10-2026" }
];

if (fs.existsSync(GALLERY_FILE)) {
    try {
        galleryPhotos = JSON.parse(fs.readFileSync(GALLERY_FILE, 'utf8'));
    } catch (e) {
        console.log('Fout bij laden gallery.json');
    }
}

function saveGallery() {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify(galleryPhotos, null, 2));
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
    const j = jobDriver.toLowerCase().trim();
    const a = accountUsername.toLowerCase().trim();
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
    }
});

function parseAndAddJob(message) {
    let from = '', to = '', driver = '', cargo = 'Vracht', distanceStr = '0 km', paidAmount = 0;
    let timestamp = message.createdTimestamp || Date.now();

    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const title = embed.title || '';
        const description = embed.description || '';
        
        if (title.includes('→') || title.includes('->')) {
            const separator = title.includes('→') ? '→' : '->';
            const parts = title.split(separator);
            from = cleanText(parts[0]);
            to = cleanText(parts[1]);
        } else if (description.includes('→') || description.includes('->')) {
            const separator = description.includes('→') ? '→' : '->';
            const parts = description.split(separator);
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
    if (paidAmount === 0 && kmAmount > 0) {
        paidAmount = kmAmount * 35;
    }

    const jobObj = {
        id: message.id || "job-" + Date.now() + "-" + Math.random(),
        from,
        to,
        driver,
        cargo,
        distance: `${kmAmount.toLocaleString('nl-NL')} km`,
        kmAmount,
        paidAmount,
        timestamp,
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
        if (!channel) return;
        
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
            deliveries: userJobs.length,
            distance: `${userKm.toLocaleString('nl-NL')} km`,
            earnings: `€ ${userEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            rawEarnings: userEarnings,
            userJobs: userJobs.slice(0, 15),
            badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
        };
    });

    const weeklyChartData = {};
    allJobsHistory.forEach(j => {
        const w = j.weekKey || 'Week';
        if (!weeklyChartData[w]) weeklyChartData[w] = { week: w, company: 0, drivers: {} };
        weeklyChartData[w].company += j.paidAmount;
        
        const driverName = j.driver.toLowerCase();
        if (!weeklyChartData[w].drivers[driverName]) weeklyChartData[w].drivers[driverName] = 0;
        weeklyChartData[w].drivers[driverName] += j.paidAmount;
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
        weeklyChartData: Object.values(weeklyChartData).reverse().slice(0, 8)
    });
});

app.post('/api/staff/update-password', (req, res) => {
    const { targetUser, newPassword, adminUser } = req.body;
    const adminAcc = accountsDatabase.find(d => d.username.toLowerCase() === (adminUser || '').toLowerCase());

    if (!adminAcc || !canManageStaff(adminAcc.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten om wachtwoorden aan te passen.' });
    }

    const targetAcc = accountsDatabase.find(d => d.username.toLowerCase() === (targetUser || '').toLowerCase());
    if (!targetAcc) {
        return res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });
    }

    targetAcc.password = newPassword.trim();
    saveAccounts();
    res.json({ success: true, message: `Wachtwoord voor ${targetAcc.username} succesvol aangepast!` });
});

app.post('/api/absence', (req, res) => {
    const { username, fromDate, toDate, reason } = req.body;
    if (!username || !fromDate || !toDate) {
        return res.status(400).json({ success: false, message: 'Vul alle velden in.' });
    }

    const newAbsence = {
        id: "abs-" + Date.now(),
        username,
        fromDate,
        toDate,
        reason: reason || "Vakantie / Afwezigheid",
        status: "In behandeling",
        dateSubmitted: new Date().toLocaleDateString('nl-NL')
    };

    absenceList.unshift(newAbsence);
    res.json({ success: true, message: 'Afwezigheid ingediend!' });
});

app.post('/api/absence/status', (req, res) => {
    const { absenceId, newStatus, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !canManageStaff(account.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten.' });
    }

    const item = absenceList.find(a => a.id === absenceId);
    if (item) {
        item.status = newStatus;
        return res.json({ success: true, message: `Status gewijzigd naar '${newStatus}'` });
    }
    res.status(404).json({ success: false, message: 'Niet gevonden.' });
});

app.delete('/api/absence/:id', (req, res) => {
    const absenceId = req.params.id;
    const username = req.query.username;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !canManageStaff(account.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten.' });
    }

    absenceList = absenceList.filter(a => a.id !== absenceId);
    res.json({ success: true, message: 'Verwijderd.' });
});

app.post('/api/staff/add', (req, res) => {
    const { username, role, adminUser } = req.body;
    const adminAcc = accountsDatabase.find(d => d.username.toLowerCase() === (adminUser || '').toLowerCase());

    if (!adminAcc || !canManageStaff(adminAcc.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten.' });
    }

    if (accountsDatabase.some(d => d.username.toLowerCase() === username.toLowerCase().trim())) {
        return res.status(400).json({ success: false, message: 'Gebruiker bestaat al.' });
    }

    const generatedPassword = "Brecht" + Math.floor(1000 + Math.random() * 9000);
    accountsDatabase.push({
        username: username.trim(),
        password: generatedPassword,
        role: role.trim()
    });

    saveAccounts();
    res.json({ success: true, message: `Personeelslid ${username} toegevoegd! Wachtwoord: ${generatedPassword}` });
});

app.post('/api/staff/update-role', (req, res) => {
    const { targetUser, newRole, adminUser } = req.body;
    const adminAcc = accountsDatabase.find(d => d.username.toLowerCase() === (adminUser || '').toLowerCase());

    if (!adminAcc || !canManageStaff(adminAcc.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten.' });
    }

    const targetAcc = accountsDatabase.find(d => d.username.toLowerCase() === (targetUser || '').toLowerCase());
    if (targetAcc) {
        targetAcc.role = newRole.trim();
        saveAccounts();
        return res.json({ success: true, message: `Rol van ${targetAcc.username} gewijzigd!` });
    }
    res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });
});

app.delete('/api/staff/:targetUser', (req, res) => {
    const targetUser = req.params.targetUser;
    const adminUser = req.query.adminUser;
    const adminAcc = accountsDatabase.find(d => d.username.toLowerCase() === (adminUser || '').toLowerCase());

    if (!adminAcc || !canManageStaff(adminAcc.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten.' });
    }

    accountsDatabase = accountsDatabase.filter(d => d.username.toLowerCase() !== targetUser.toLowerCase());
    saveAccounts();
    res.json({ success: true, message: `Personeelslid ${targetUser} is ontslagen.` });
});

app.post('/api/gallery', upload.single('photo'), (req, res) => {
    const username = req.body.username;
    if (!req.file) return res.status(400).json({ success: false, message: 'Geen bestand.' });

    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${b64}`;

    const newPhoto = {
        id: "photo-" + Date.now(),
        url: dataUrl,
        uploadedBy: username,
        date: new Date().toLocaleDateString('nl-NL')
    };

    galleryPhotos.unshift(newPhoto);
    saveGallery();
    res.json({ success: true, message: 'Foto geüpload!' });
});

app.delete('/api/gallery/:id', (req, res) => {
    const photoId = req.params.id;
    galleryPhotos = galleryPhotos.filter(p => p.id !== photoId);
    saveGallery();
    res.json({ success: true, message: 'Foto verwijderd.' });
});

app.post('/api/badges', (req, res) => {
    const { title, targetUser, username } = req.body;
    const newBadge = { 
        id: "badge-" + Date.now(), 
        title: title.trim(), 
        targetUser: targetUser.trim(), 
        awardedBy: username,
        date: new Date().toLocaleDateString('nl-NL')
    };
    customBadges.push(newBadge);
    res.json({ success: true, message: `Badge "${title}" gegeven aan ${targetUser}!` });
});

app.post('/api/badges/delete', (req, res) => {
    const { badgeId } = req.body;
    customBadges = customBadges.filter(b => b.id !== badgeId);
    res.json({ success: true, message: 'Badge ingetrokken!' });
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN);
}

app.listen(PORT, () => {
    console.log(`Server gestart op poort ${PORT}`);
});
