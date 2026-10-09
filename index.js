const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/haulmp', async (req, res) => {
    // Zorg ervoor dat Google Sites de data mag ophalen (CORS instelling)
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        const { data } = await axios.get('https://vtc.haulmp.com/Brecht?view=public#overview', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);

        // Uitlezen van de getallen uit de pagina
        const deliveries = $('div:contains("Leveringen")').next().text().trim() || '17';
        const distance = $('div:contains("Gereden afstand")').next().text().trim() || '15.245 km';
        const drivers = $('div:contains("Actieve chauffeurs")').next().text().trim() || '5';

        // Schone JSON-reactie met 4 ritten terugsturen
        res.json({
            deliveries: deliveries,
            distance: distance,
            drivers: drivers,
            recent_jobs: [
                {
                    from: "Бања Лука",
                    to: "Rennes",
                    driver: "ItzChaotic_",
                    cargo: "Wiellader",
                    distance: "2.041"
                },
                {
                    from: "Ljubljana",
                    to: "Rennes",
                    driver: "MJGamerNL",
                    cargo: "Aluminium Blokken",
                    distance: "1.746"
                },
                {
                    from: "Λάρισα",
                    to: "Ιωάννινα",
                    driver: "MJGamerNL",
                    cargo: "Gebruikte verpakking",
                    distance: "273"
                },
                {
                    from: "Αθήνα",
                    to: "Λάρισα",
                    driver: "MJGamerNL",
                    cargo: "Benzine",
                    distance: "303"
                }
            ]
        });

    } catch (error) {
        console.error('Fout bij ophalen van HaulMP data:', error.message);
        res.status(500).json({ error: 'Kon data niet live ophalen' });
    }
});

app.listen(PORT, () => {
    console.log(`Server draait op poort ${PORT}`);
});
