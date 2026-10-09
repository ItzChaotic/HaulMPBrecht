const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/haulmp', async (req, res) => {
    // CORS inschakelen voor Google Sites
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        // Haal data op via ingebouwde native fetch
        const response = await fetch('https://vtc.haulmp.com/api/v1/vtc/Brecht', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return res.json(data);
        }

        // Als de live API geen succes geeft, stuur actuele fallback data
        res.json(getFallbackData());

    } catch (error) {
        console.error('Fout bij ophalen van data:', error.message);
        res.json(getFallbackData());
    }
});

function getFallbackData() {
    return {
        deliveries: "17",
        distance: "15.245 km",
        drivers: "5",
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
    };
}

app.listen(PORT, () => {
    console.log(`Server draait op poort ${PORT}`);
});
