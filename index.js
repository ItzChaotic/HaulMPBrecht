const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';

// Beginstanden (worden automatisch opgehoogd bij nieuwe ritten)
let totalDeliveries = 19;
let totalDistanceKm = 16200;

let recentJobs = [
    { from: "Rennes", to: "Bordeaux", driver: "MJGamerNL", cargo: "Benzine", distance: "478 km" },
    {Om de gewenste kleuren op basis van trefwoorden (*"bevat"*) mee te geven aan het dashboard, kunnen we een **`color`** eigenschap toevoegen aan elk lid in de `drivers_list`. 

Met een kleine hulpprogramma-functie (`getRoleColor`) kijkt het script naar de tekst in de rol en kent het automatisch de juiste kleurcode toe.

---

### Aangepaste `index.js`

Vervang je gehele `index.js` door onderstaande code:

```javascript
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';

// Beginstanden (worden automatisch opgehoogd bij nieuwe ritten)
let totalDeliveries = 19;
let totalDistanceKm = 16200;

let recentJobs = [
    { from: "Rennes", to: "Bordeaux", driver: "MJGamerNL", cargo: "Benzine", distance: "478 km" },
    { from: "Rennes", to: "Bordeaux", driver: "itzchaotic_", cargo: "Benzine", distance: "477 km" },
    { from: "Бања Лука", to: "Rennes", driver: "ItzChaotic_", cargo: "Wiellader", distance: "2.041 km" },
    { from: "Ljubljana", to: "Rennes", driver: "MJGamerNL", cargo: "Aluminium Blokken", distance: "1.746 km" }
];

// Ledenlijst met rolnamen
const rawDriversList = [
    { username: "MJGamerNL", role: "Directeur" },
    { username: "ItzChaotic_", role: "Onder Directeur / Development" },
    { username: "Ramona", role: "Onder Directeur" },
    { username: "JoeyKj", role: "Management" },
    { username: "Jellybear", role: "Management" },
    { username: "Dansco54", role: "Leidinggevende" },
    { username: "Zinnorax", role: "Leidinggevende" },
    { username: "JoeyKj", role: "Leidinggevende" }
];

// Functie om de kleur te bepalen op basis van de roltitel ("bevat")
function getRoleColor(role) {
    const r = (role || '').toLowerCase();
    
    // De volgorde is belangrijk: 'Onder Directeur' moet voor 'Directeur' gecheckt worden
    if (r.includes('onder directeur')) return 'orange';  // Oranje
    if (r.includes('directeur')) return 'red';           // Rood
    if (r.includes('management')) return 'yellow';       // Geel
    if (r.includes('leidinggevende')) return 'green';    // Groen
    if (r.includes('senior werknemer')) return 'blue';   // Blauw
    if (r.includes('werknemer')) return 'purple';        // Paars
    
    return 'gray'; // Standaardkleur indien er geen match is
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

// Zodra er een nieuwe rit in Discord komt: verwerk rit + hoog de totalen op!
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

app.get('/api/haulmp', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Dynamisch toevoegen van het 'color' veld op basis van de rolnaam
    const formattedDrivers = rawDriversList.map(m => ({
        username: m.username,
        role: m.role,
        color: getRoleColor(m.role)
    }));

    res.json({
        deliveries: totalDeliveries.toString(),
        distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
        drivers: formattedDrivers.length.toString(),
        drivers_list: formattedDrivers,
        recent_jobs: recentJobs
    });
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN);
} else {
    console.log("Wachten op DISCORD_BOT_TOKEN in Render...");
}

app.listen(PORT, () => {
    console.log(`Automatische teller-proxy met rolkleuren actief op poort ${PORT}`);
});
