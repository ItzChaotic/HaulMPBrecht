const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
// Voeg deze regel direct onder 'const app = express();' toe als hij er nog niet staat:
app.use(express.json());

// En zorg dat je login route er zo uitziet:
app.post('/api/login', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    // Als het een preflight OPTIONS request is, direct succes retourneren
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
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
const PORT = process.env.PORT || 3000;

app.use(express.json());

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';

// ==========================================
// PERSONEEL & WACHTWOORDEN LIJST
// ==========================================
// Hier kun je per persoon een gebruikersnaam en eigen wachtwoord instellen!
const accountsDatabase = [
    { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur / Development" },
    { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

// Databronnen voor het portaal (geheugen-opslag)
let absenceList = [];
let customBadges = [];
let galleryPhotos = [
    { url: "https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/DAF.jpg", uploadedBy: "MJGamerNL", isPotw: true }
];

// Beginstanden ritten & statistieken
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
        const parsed = [];

        messages.forEach(msg => {
            if (msg.embeds && msg.embeds.length > 0) {
                const embed = msg.embeds[0];
                const title = embed.title || '';
                
                if (title.includes('→')) {
                    const parts = title.split('→');
                    let driver = 'Chauffeur';
                    let distanceStr = '---';
                    
                    embed.fields?.forEach(f => {
                        if (f.name.toLowerCase().includes('driver')) driver = f.value.replace(/[\*\_\`]/g, '').trim();
                        if (f.name.toLowerCase().includes('distance')) distanceStr = f.value.replace(/[\*\_\`]/g, '').trim();
                    });

                    parsed.push({
                        from: parts[0]?.trim() || 'Onbekend',
                        to: parts[1]?.trim() || 'Onbekend',
                        driver: driver,
                        cargo: embed.description?.split('\n')[0]?.trim() || 'Vracht',
                        distance: distanceStr
                    });
                }
            }
        });

        if (parsed.length > 0) {
            recentJobs = parsed.slice(0, 5);
        }
    } catch (err) {
        console.error('Fout bij ophalen Discord geschiedenis:', err.message);
    }
}

// ==========================================
// API ROUTES VOOR WEBSITE & PORTAAL
// ==========================================

// Inloggen op het portaal met individueel wachtwoord
app.post('/api/login', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    const { username, password } = req.body;
    
    // Zoek het account op in de database
    const account = accountsDatabase.find(
        acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password
    );

    if (!account) {
        return res.status(401).json({ success: false, message: 'Onjuiste gebruikersnaam of wachtwoord!' });
    }

    // Bereken persoonlijke statistieken
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

// Hoofd API Endpoint
app.get('/api/haulmp', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
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

// Afwezigheid indienen
app.post('/api/absence', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { username, fromDate, toDate, reason } = req.body;
    if (!username || !fromDate || !toDate) {
        return res.status(400).json({ success: false, message: 'Vul alle velden in.' });
    }

    absenceList.push({ username, fromDate, toDate, reason, dateSubmitted: new Date().toLocaleDateString('nl-NL') });
    res.json({ success: true, message: 'Afwezigheid succesvol doorgegeven!' });
});

// Foto uploaden
app.post('/api/gallery', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { url, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());
    const role = account ? account.role.toLowerCase() : '';

    if (!account || (!role.includes('directeur') && !role.includes('management'))) {
        return res.status(403).json({ success: false, message: 'Geen rechten om foto\'s te uploaden.' });
    }

    if (!url) {
        return res.status(400).json({ success: false, message: 'Geef een geldige URL op.' });
    }

    galleryPhotos.push({ url, uploadedBy: username, isPotw: false });
    res.json({ success: true, message: 'Foto succesvol toegevoegd aan de galerij!' });
});

// Foto van de week instellen
app.post('/api/set-potw', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { index, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !account.role.toLowerCase().includes('directeur')) {
        return res.status(403).json({ success: false, message: 'Alleen Directeur en Onder Directeur kunnen dit instellen.' });
    }

    galleryPhotos.forEach((p, i) => p.isPotw = (i === parseInt(index)));
    res.json({ success: true, message: 'Foto van de week ingesteld!' });
});

// Badges toekennen
app.post('/api/badges', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { title, targetUser, username } = req.body;
    const account = accountsDatabase.find(d => d.username.toLowerCase() === (username || '').toLowerCase());

    if (!account || !account.role.toLowerCase().includes('directeur')) {
        return res.status(403).json({ success: false, message: 'Alleen Directeur en Onder Directeur kunnen badges toekennen.' });
    }

    customBadges.push({ title, targetUser });
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
