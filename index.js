const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

app.get('/api/haulmp', async (req, res) => {
    // Geef toestemming aan Google Sites om deze data te lezen
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        // Haal de live VTC-gegevens op van de officiële HaulMP API
        const response = await axios.get('https://vtc.haulmp.com/api/vtc/Brecht');
        
        // Stuur de JSON data door naar jouw site
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Kon data van HaulMP niet ophalen' });
    }
});

app.listen(PORT, () => {
    console.log(`Proxy draait op poort ${PORT}`);
});
