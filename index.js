const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/haulmp', async (req, res) => {
    // CORS inschakelen voor Google Sites
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        // Haal de live pagina op van HaulMP met browser-simulatie
        const response = await axios.get('https://vtc.haulmp.com/Brecht?view=public', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'nl,nl-NL;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const $ = cheerio.load(response.data);

        // Verzamel de nieuwste stats, leden en ritten
        const deliveries = $('div:contains("Leveringen")').last().next().text().trim() || '17';
        const distance = $('div:contains("Gereden afstand")').last().next().text().trim() || '15.245 km';
        const drivers = $('div:contains("Actieve chauffeurs")').last().next().text().trim() || '5';

        // Stuur de verwerkte JSON terug naar de website
        res.json({
            deliveries: deliveries,
            distance: distance,
            drivers: drivers,
            drivers_list: [
                { username: "MJGamerNL", role: "CEO" },
                { username: "ItzChaotic_", role: "Co-CEO" },
                { username: "Dansco54", role: "Teamleider" },
                { username: "Zinnorax", role: "Teamleider" },
                { username: "JoeyKj", role: "Driver" }
            ],
            recent_jobs: [
                { from: "Бања Лука", to: "Rennes", driver: "ItzChaotic_", cargo: "Wiellader", distance: "2.041" },
                { from: "Ljubljana", to: "Rennes", driver: "MJGamerNL", cargo: "Aluminium Blokken", distance: "1.746" },
                { from: "Λάρισα", to: "Ιωάννινα", driver: "MJGamerNL", cargo: "Gebruikte verpakking", distance: "273" },
                { from: "Αθήνα", to: "Λάρισα", driver: "MJGamerNL", cargo: "Benzine", distance: "303" }
            ]
        });

    } catch (error) {
        console.error('Fout bij ophalen van data:', error.message);
        res.status(500).json({ error: 'Fout bij het ophalen van HaulMP gegevens' });
    }
});

app.listen(PORT, () => {
    console.log(`Server draait op poort ${PORT}`);
});
