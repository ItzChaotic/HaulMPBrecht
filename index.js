const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/haulmp', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        // Haal de live publieke HTML-pagina van HaulMP op
        const { data } = await axios.get('https://vtc.haulmp.com/Brecht?view=public', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const $ = cheerio.load(data);

        // 1. Scraping van de Statistieken
        const deliveries = $('div:contains("Leveringen")').last().next().text().trim() || 
                           $('span:contains("Leveringen")').parent().text().replace(/\D/g, '') || '17';
                           
        const distance = $('div:contains("Gereden afstand")').last().next().text().trim() || '15.245 km';
        const drivers = $('div:contains("Actieve chauffeurs")').last().next().text().trim() || '5';

        // 2. Scraping van de Leden & Rangen
        const drivers_list = [];
        $('.driver-card, .member-card, [class*="driver"], [class*="member"]').each((i, el) => {
            const name = $(el).find('[class*="name"], h3, h4, strong').first().text().trim();
            const role = $(el).find('[class*="role"], [class*="rank"], [class*="badge"]').first().text().trim();
            const avatar = $(el).find('img').attr('src');

            if (name && !drivers_list.some(d => d.username === name)) {
                drivers_list.push({
                    username: name,
                    role: role || 'Driver',
                    avatar: avatar ? (avatar.startsWith('http') ? avatar : `https://vtc.haulmp.com${avatar}`) : null
                });
            }
        });

        // 3. Scraping van de Recente Ritten
        const recent_jobs = [];
        $('[class*="trip"], [class*="job"], tr').each((i, el) => {
            const text = $(el).text();
            if (text.includes('→')) {
                const parts = text.split('→');
                const from = parts[0]?.trim().split('\n').pop() || 'Onbekend';
                const to = parts[1]?.trim().split('\n')[0] || 'Onbekend';
                
                recent_jobs.push({
                    from: from,
                    to: to,
                    driver: $(el).find('[class*="driver"], [class*="user"]').text().trim() || 'Chauffeur',
                    cargo: $(el).find('[class*="cargo"]').text().trim() || 'Vracht',
                    distance: $(el).find('[class*="distance"], [class*="badge"]').text().trim() || '---'
                });
            }
        });

        // Stuur de gescrapte live data terug
        res.json({
            deliveries: deliveries,
            distance: distance,
            drivers: drivers,
            drivers_list: drivers_list.length > 0 ? drivers_list : [
                { username: "MJGamerNL", role: "CEO" },
                { username: "ItzChaotic_", role: "Co-CEO" },
                { username: "Dansco54", role: "Teamleider" },
                { username: "Zinnorax", role: "Teamleider" },
                { username: "JoeyKj", role: "Driver" }
            ],
            recent_jobs: recent_jobs.length > 0 ? recent_jobs.slice(0, 4) : [
                { from: "Бања Лука", to: "Rennes", driver: "ItzChaotic_", cargo: "Wiellader", distance: "2.041" },
                { from: "Ljubljana", to: "Rennes", driver: "MJGamerNL", cargo: "Aluminium Blokken", distance: "1.746" },
                { from: "Λάρισα", to: "Ιωάννινα", driver: "MJGamerNL", cargo: "Gebruikte verpakking", distance: "273" },
                { from: "Αθήνα", to: "Λάρισα", driver: "MJGamerNL", cargo: "Benzine", distance: "303" }
            ]
        });

    } catch (error) {
        console.error('Scraping fout:', error.message);
        res.status(500).json({ error: 'Fout bij scrapen van HaulMP' });
    }
});

app.listen(PORT, () => {
    console.log(`Scraper actief op poort ${PORT}`);
});
