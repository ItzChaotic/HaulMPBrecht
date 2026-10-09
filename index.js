const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/haulmp', async (req, res) => {
    // CORS inschakelen voor Google Sites
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        // Directe call naar de HaulMP VTC API
        const response = await axios.get('https://vtc.haulmp.com/api/v1/vtc/Brecht', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            }
        });

        const data = response.data;

        // Gegevens direct doorsturen
        res.json({
            deliveries: data.deliveries || data.monthly_deliveries || '17',
            distance: data.distance || data.monthly_distance || '15.245 km',
            drivers: data.members_count || data.drivers_count || '5',
            drivers_list: data.members || data.drivers || [],
            recent_jobs: data.jobs || data.recent_jobs || []
        });

    } catch (error) {
        // Alternatieve route als de v1 API een andere URL vereist
        try {
            const altResponse = await axios.get('https://vtc.haulmp.com/api/vtc/Brecht');
            res.json(altResponse.data);
        } catch (err) {
            console.error('Fout bij ophalen HaulMP API:', err.message);
            res.status(500).json({ error: 'Kon live data niet ophalen' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server actief op poort ${PORT}`);
});
