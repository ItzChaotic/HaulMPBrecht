const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const multer = require('multer');

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';

const accountsDatabase = [
    { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur / Development" },
    { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

let absenceList = [];
let customBadges = []; 
let galleryPhotos = [
    { id: "photo-1", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", date: "10-10-2026" },
    { id: "photo-2", url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/Schermafbeelding%202026-10-08%20203105.png", uploadedBy: "ItzChaotic_", date: "10-10-2026" }
];

let totalDeliveries = 19;
let totalDistanceKm = 16200;
let allJobsHistory = [
    { id: "demo-1", from: "Rennes", to: "Bordeaux", driver: "MJGamerNL", cargo: "Benzine", distance: "478 km", kmAmount: 478, timestamp: Date.now() },
    { id: "demo-2", from: "Amsterdam", to: "Eindhoven", driver: "JoeyKj", cargo: "Chemische Sorbens", distance: "146 km", kmAmount: 146, timestamp: Date.now() }
];

function cleanText(text) {
    if (!text) return '';
    return text.replace(/[\*\_\`]/g, '').trim();
}

function getRoleColor(role) {
    const r = (role || '').toLowerCase();
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', () => {
    console.log(`Discord Bot ingelogd als ${client.user.tag}`);
    fetchAllHistoricalDiscordLogs();
});

client.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) {
        parseAndAddJob(message, true);
    }
});

function parseAndAddJob(message, isLiveNew = false) {
    let from = 'Onbekend', to = 'Onbekend', driver = 'Chauffeur', cargo = 'Vracht', distanceStr = '0';
    let timestamp = message.createdTimestamp || Date.now();

    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        const title = embed.title || '';
        const description = embed.description || '';
        
        if (title.includes('→') || description.includes('→')) {
            const routeStr = title.includes('→') ? title : description;
            const parts = routeStr.split('→');
            from = cleanText(parts[0]);
            to = cleanText(parts[1]);
        }

        embed.fields?.forEach(f => {
            if (f.name.toLowerCase().includes('driver')) driver = cleanText(f.value);
            if (f.name.toLowerCase().includes('distance')) distanceStr = cleanText(f.value);
        });

        if (description && !description.includes('→')) {
            cargo = cleanText(description.split('\n')[0]);
        }
    } else if (message.content && message.content.includes('→')) {
        const parts = message.content.split('→');
        from = cleanText(parts[0]);
        to = cleanText(parts[1]);
        driver = cleanText(message.author.username);
        cargo = "Standaard Vracht";
        distanceStr = "250 km";
    } else {
        return;
    }

    const kmAmount = parseInt(distanceStr.replace(/\D/g, ''), 10) || 0;

    const jobObj = {
        id: message.id || "job-" + Date.now(),
        from,
        to,
        driver,
        cargo,
        distance: `${kmAmount.toLocaleString('nl-NL')} km`,
        kmAmount,
        timestamp
    };

    if (!allJobsHistory.some(j => j.id === jobObj.id)) {
        allJobsHistory.unshift(jobObj);
        if (isLiveNew) {
            totalDeliveries += 1;
            totalDistanceKm += kmAmount;
        }
    }
}

async function fetchAllHistoricalDiscordLogs() {
    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel) return;
        
        let lastId = undefined;
        let fetchedTotal = 0;
        
        while (fetchedTotal < 300) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            
            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;
            
            messages.forEach(msg => parseAndAddJob(msg, false));
            lastId = messages.last().id;
            fetchedTotal += messages.size;
            
            if (messages.size < 100) break;
        }

        totalDeliveries = allJobsHistory.length;
        totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
        console.log(`Historie gesynchroniseerd: ${totalDeliveries} ritten gevonden.`);
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

    const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
    const userJobsLast10Days = allJobsHistory.filter(j => 
        j.driver.toLowerCase() === account.username.toLowerCase() && j.timestamp >= tenDaysAgo
    );

    const driverKm = userJobsLast10Days.reduce((acc, curr) => acc + curr.kmAmount, 0);

    res.json({
        success: true,
        username: account.username,
        role: account.role,
        color: getRoleColor(account.role),
        canManageBadges: canManageBadges(account.role),
        stats: {
            deliveries: userJobsLast10Days.length,
            distance: `${driverKm.toLocaleString('nl-NL')} km`
        }
    });
});

app.get('/api/haulmp', (req, res) => {
    const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);

    const formattedDrivers = accountsDatabase.map(m => {
        const userJobs = allJobsHistory.filter(j => j.driver.toLowerCase() === m.username.toLowerCase() && j.timestamp >= tenDaysAgo);
        const userKm = userJobs.reduce((acc, curr) => acc + curr.kmAmount, 0);
        
        return {
            username: m.username,
            role: m.role,
            color: getRoleColor(m.role),
            deliveries: userJobs.length,
            distance: `${userKm.toLocaleString('nl-NL')} km`,
            badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
        };
    });

    res.json({
        deliveries: totalDeliveries.toString(),
        distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
        drivers: formattedDrivers.length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: allJobsHistory.slice(0, 10),
        absence: absenceList,
        gallery: galleryPhotos,
        badges: customBadges
    });
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
        reason: reason || "Geen reden opgegeven",
        status: "In behandeling",
        dateSubmitted: new Date().toLocaleDateString('nl-NL')
    };

    absenceList.unshift(newAbsence);
    res.json({ success: true, message: 'Afwezigheid succesvol ingediend!' });
});

app.post('/api/absence/status', (req, res) => {
    const { absenceId, newStatus, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !account.role.toLowerCase().includes('directeur')) {
        return res.status(403).json({ success: false, message: 'Alleen Directie & Onder Directie kunnen dit wijzigen.' });
    }

    const item = absenceList.find(a => a.id === absenceId);
    if (item) {
        item.status = newStatus;
        return res.json({ success: true, message: `Status gewijzigd naar '${newStatus}'` });
    }

    res.status(404).json({ success: false, message: 'Afwezigheidsverzoek niet gevonden.' });
});

app.post('/api/gallery', upload.single('photo'), (req, res) => {
    const username = req.body.username;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account) return res.status(403).json({ success: false, message: 'Geen geldig account.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Geen bestand geselecteerd.' });

    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${b64}`;

    const newPhoto = {
        id: "photo-" + Date.now(),
        url: dataUrl,
        uploadedBy: username,
        date: new Date().toLocaleDateString('nl-NL')
    };

    galleryPhotos.unshift(newPhoto);
    res.json({ success: true, message: 'Foto geüpload en direct zichtbaar!' });
});

app.delete('/api/gallery/:id', (req, res) => {
    const photoId = req.params.id;
    const username = req.query.username;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());
    const role = account ? account.role.toLowerCase() : '';

    if (!account || (!role.includes('directeur') && !role.includes('management'))) {
        return res.status(403).json({ success: false, message: 'Geen rechten.' });
    }

    galleryPhotos = galleryPhotos.filter(p => p.id !== photoId);
    res.json({ success: true, message: 'Foto succesvol verwijderd.' });
});

app.post('/api/badges', (req, res) => {
    const { title, targetUser, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !canManageBadges(account.role)) {
        return res.status(403).json({ success: false, message: 'Geen rechten om badges toe te kennen.' });
    }

    const newBadge = { 
        id: "badge-" + Date.now() + "-" + Math.floor(Math.random() * 10000), 
        title: title.trim(), 
        targetUser: targetUser.trim(), 
        awardedBy: username,
        date: new Date().toLocaleDateString('nl-NL')
    };

    customBadges.push(newBadge);
    res.json({ success: true, message: `Badge "${title}" toegekend aan ${targetUser}!` });
});

// Gegarandeerd werkende route voor het intrekken van badges
app.post('/api/badges/delete', (req, res) => {
    const { badgeId } = req.body;
    const beforeCount = customBadges.length;
    customBadges = customBadges.filter(b => b.id !== badgeId);

    if (customBadges.length < beforeCount) {
        return res.json({ success: true, message: 'Badge succesvol ingetrokken!' });
    } else {
        return res.status(404).json({ success: false, message: 'Badge kon niet worden gevonden.' });
    }
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN);
} else {
    console.log("Wachten op DISCORD_BOT_TOKEN in Render...");
}

app.listen(PORT, () => {
    console.log(`Portaal-server actief op poort ${PORT}`);
});
