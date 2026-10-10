const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Max 10MB per foto
});

// CORS Header Setup
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';

// Database met Accounts & Rangen
const accountsDatabase = [
    { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur / Development" },
    { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

// In-Memory Data Opslag
let absenceList = [];
let customBadges = [];
let galleryPhotos = [
    { id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" },
    { id: "photo-2", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/Schermafbeelding%202026-10-08%20203105.png", uploadedBy: "ItzChaotic_", date: "10-10-2026" }
];

let totalDeliveries = 19;
let totalDistanceKm = 16200;

let recentJobs = [
    { from: "Rennes", to: "Bordeaux", driver: "MJGamerNL", cargo: "Benzine", distance: "478 km" },
    { from: "Rennes", to: "Bordeaux", driver: "itzchaotic_", cargo: "Benzine", distance: "477 km" },
    { from: "Бања Лука", to: "Rennes", driver: "ItzChaotic_", cargo: "Wiellader", distance: "2.041 km" },
    { from: "Ljubljana", to: "Rennes", driver: "MJGamerNL", cargo: "Aluminium Blokken", distance: "1.746 km" }
];

function getRoleColor(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('onder directeur')) return 'orange';
    if (r.includes('directeur')) return 'red';
    if (r.includes('management')) return 'yellow';
    if (r.includes('leidinggevende')) return 'green';
    if (r.includes('senior werknemer')) return 'blue';
    if (r.includes('werknemer')) return 'purple';
    return 'gray';
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', () => {
    console.log(`Discord Bot ingelogd als ${client.user.tag}`);
    fetchDiscordLogs();
});

client.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) {
        parseAndAddJob(message, true);
    }
});

function parseAndAddJob(message, isLiveNew = false) {
    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const title = embed.title || '';
        const description = embed.description || '';
        
        if (title.includes('→') || description.includes('→')) {
            const routeStr = title.includes('→') ? title : description;
            const parts = routeStr.split('→');
            
            const from = parts[0]?.replace(/[\*\_\`]/g, '').trim() || 'Onbekend';
            const to = parts[1]?.replace(/[\*\_\`]/g, '').trim() || 'Onbekend';

            let driver = 'Chauffeur';
            let distanceStr = '0';
            let cargo = 'Vracht';

            embed.fields?.forEach(f => {
                if (f.name.toLowerCase().includes('driver')) driver = f.value.replace(/[\*\_\`]/g, '').trim();
                if (f.name.toLowerCase().includes('distance')) distanceStr = f.value.replace(/[\*\_\`]/g, '').trim();
            });

            if (description && !description.includes('→')) {
                cargo = description.split('\n')[0].trim();
            }

            const kmAmount = parseInt(distanceStr.replace(/\D/g, ''), 10) || 0;

            if (isLiveNew) {
                totalDeliveries += 1;
                totalDistanceKm += kmAmount;
            }

            recentJobs.unshift({ 
                from, 
                to, 
                driver, 
                cargo, 
                distance: `${kmAmount.toLocaleString('nl-NL')} km` 
            });
            recentJobs = recentJobs.slice(0, 5);
        }
    }
}

async function fetchDiscordLogs() {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 15 });
        messages.forEach(msg => parseAndAddJob(msg, false));
    } catch (err) {
        console.error('Fout bij ophalen Discord geschiedenis:', err.message);
    }
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Inloggen
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const account = accountsDatabase.find(
        acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password
    );

    if (!account) {
        return res.status(401).json({ success: false, message: 'Onjuiste gebruikersnaam of wachtwoord!' });
    }

    const driverJobs = recentJobs.filter(j => j.driver.toLowerCase() === account.username.toLowerCase());
    const driverKm = driverJobs.reduce((acc, curr) => acc + (parseInt(curr.distance.replace(/\D/g, ''), 10) || 0), 0);

    res.json({
        success: true,
        username: account.username,
        role: account.role,
        color: getRoleColor(account.role),
        stats: {
            deliveries: driverJobs.length,
            distance: `${driverKm.toLocaleString('nl-NL')} km`
        }
    });
});

// Algemene Website & Portaal Data
app.get('/api/haulmp', (req, res) => {
    const formattedDrivers = accountsDatabase.map(m => ({
        username: m.username,
        role: m.role,
        color: getRoleColor(m.role)
    }));

    res.json({
        deliveries: totalDeliveries.toString(),
        distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
        drivers: formattedDrivers.length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: recentJobs,
        absence: absenceList,
        gallery: galleryPhotos,
        badges: customBadges
    });
});

// Afwezigheid Inloggen / Doorgeven
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
        reason: reason || "Geen reden opgegeven",
        status: "In behandeling",
        dateSubmitted: new Date().toLocaleDateString('nl-NL')
    };

    absenceList.unshift(newAbsence);
    res.json({ success: true, message: 'Afwezigheid succesvol ingediend!' });
});

// Afwezigheid Status Wijzigen (Directeur & Onder Directeur)
app.post('/api/absence/status', (req, res) => {
    const { absenceId, newStatus, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !account.role.toLowerCase().includes('directeur')) {
        return res.status(403).json({ success: false, message: 'Alleen Directie kan dit goedkeuren of afwijzen.' });
    }

    const item = absenceList.find(a => a.id === absenceId);
    if (item) {
        item.status = newStatus;
        return res.json({ success: true, message: `Status gewijzigd naar '${newStatus}'` });
    }

    res.status(404).json({ success: false, message: 'Afwezigheidsverzoek niet gevonden.' });
});

// Foto Uploaden (Direct Live)
app.post('/api/gallery', upload.single('photo'), (req, res) => {
    const username = req.body.username;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account) {
        return res.status(403).json({ success: false, message: 'Geen geldig account.' });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Geen bestand geselecteerd.' });
    }

    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${b64}`;

    const newPhoto = {
        id: "photo-" + Date.now(),
        url: dataUrl,
        uploadedBy: username,
        date: new Date().toLocaleDateString('nl-NL')
    };

    galleryPhotos.unshift(newPhoto);
    res.json({ success: true, message: 'Foto geüpload en direct zichtbaar in de galerij!' });
});

// Foto Verwijderen (Directeur, Onder Directeur & Management)
app.delete('/api/gallery/:id', (req, res) => {
    const photoId = req.params.id;
    const username = req.query.username;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());
    const role = account ? account.role.toLowerCase() : '';

    if (!account || (!role.includes('directeur') && !role.includes('management'))) {
        return res.status(403).json({ success: false, message: 'Geen rechten om foto\'s te verwijderen.' });
    }

    galleryPhotos = galleryPhotos.filter(p => p.id !== photoId);
    res.json({ success: true, message: 'Foto succesvol verwijderd.' });
});

// Badges Toekennen (Directeur & Onder Directeur)
app.post('/api/badges', (req, res) => {
    const { title, targetUser, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !account.role.toLowerCase().includes('directeur')) {
        return res.status(403).json({ success: false, message: 'Alleen Directie kan badges toekennen.' });
    }

    customBadges.push({ id: "badge-" + Date.now(), title, targetUser, awardedBy: username });
    res.json({ success: true, message: `Badge "${title}" toegekend aan ${targetUser}!` });
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN);
} else {
    console.log("Wachten op DISCORD_BOT_TOKEN in Render...");
}

app.listen(PORT, () => {
    console.log(`Portaal-server actief op poort ${PORT}`);
});
