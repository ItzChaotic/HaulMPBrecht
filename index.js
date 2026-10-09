const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Haalt de geheime gegevens op uit de Environment Variables op Render
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';

let recentJobs = [
    { from: "Rennes", to: "Bordeaux", driver: "MJGamerNL", cargo: "Benzine", distance: "478 km" },
    { from: "Rennes", to: "Bordeaux", driver: "itzchaotic_", cargo: "Benzine", distance: "477 km" },
    { from: "Бања Лука", to: "Rennes", driver: "ItzChaotic_", cargo: "Wiellader", distance: "2.041 km" },
    { from: "Ljubljana", to: "Rennes", driver: "MJGamerNL", cargo: "Aluminium Blokken", distance: "1.746 km" }
];

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

// Zodra de HaulMP Bot een NIEUWE rit stuurt, pakt hij hem direct live op!
client.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) {
        parseAndAddJob(message);
    }
});

function parseAndAddJob(message) {
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
            let distance = '---';
            let cargo = 'Vracht';

            embed.fields?.forEach(f => {
                if (f.name.toLowerCase().includes('driver')) driver = f.value.replace(/[\*\_\`]/g, '').trim();
                if (f.name.toLowerCase().includes('distance')) distance = f.value.replace(/[\*\_\`]/g, '').trim();
            });

            if (description && !description.includes('→')) {
                cargo = description.split('\n')[0].trim();
            }

            recentJobs.unshift({ from, to, driver, cargo, distance });
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
                    let distance = '---';
                    
                    embed.fields?.forEach(f => {
                        if (f.name.toLowerCase().includes('driver')) driver = f.value.replace(/[\*\_\`]/g, '').trim();
                        if (f.name.toLowerCase().includes('distance')) distance = f.value.replace(/[\*\_\`]/g, '').trim();
                    });

                    parsed.push({
                        from: parts[0]?.trim() || 'Onbekend',
                        to: parts[1]?.trim() || 'Onbekend',
                        driver: driver,
                        cargo: embed.description?.split('\n')[0]?.trim() || 'Vracht',
                        distance: distance
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
    
    res.json({
        deliveries: "17",
        distance: "15.245 km",
        drivers: "5",
        drivers_list: [
            { username: "MJGamerNL", role: "Directeur" },
            { username: "ItzChaotic_", role: "Onder Directeur" },
            { username: "Dansco54", role: "Leidinggevende" },
            { username: "Zinnorax", role: "Leidinggevende" },
            { username: "JoeyKj", role: "Leidinggevende" }
        ],
        recent_jobs: recentJobs
    });
});

if (DISCORD_BOT_TOKEN) {
    client.login(DISCORD_BOT_TOKEN);
} else {
    console.log("Wachten op instellen van DISCORD_BOT_TOKEN in Render...");
}

app.listen(PORT, () => {
    console.log(`Discord-gekoppelde proxy draait op poort ${PORT}`);
});
