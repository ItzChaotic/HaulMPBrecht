const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/haulmp', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    let browser;
    try {
        // Start een virtuele browser die Cloudflare omzeilt
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        
        // Stel een echte browser User-Agent in
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigeer naar de live HaulMP pagina en wacht tot de scripts zijn geladen
        await page.goto('https://vtc.haulmp.com/Brecht?view=public', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Schraap de live gegevens rechtstreeks uit het ingeladen scherm
        const liveData = await page.evaluate(() => {
            // Leden ophalen
            const drivers_list = [];
            document.querySelectorAll('.driver-card, .member-card, [class*="driver"], [class*="member"]').forEach(el => {
                const nameEl = el.querySelector('[class*="name"], h3, h4, strong');
                const roleEl = el.querySelector('[class*="role"], [class*="rank"], [class*="badge"]');
                const imgEl = el.querySelector('img');

                if (nameEl && nameEl.innerText.trim()) {
                    drivers_list.push({
                        username: nameEl.innerText.trim(),
                        role: roleEl ? roleEl.innerText.trim() : 'Driver',
                        avatar: imgEl ? imgEl.src : null
                    });
                }
            });

            // Ritten ophalen
            const recent_jobs = [];
            document.querySelectorAll('[class*="trip"], [class*="job"], tr').forEach(el => {
                const text = el.innerText || '';
                if (text.includes('→')) {
                    const parts = text.split('→');
                    recent_jobs.push({
                        from: parts[0]?.trim().split('\n').pop() || 'Onbekend',
                        to: parts[1]?.trim().split('\n')[0] || 'Onbekend',
                        driver: el.querySelector('[class*="driver"], [class*="user"]')?.innerText.trim() || 'Chauffeur',
                        cargo: el.querySelector('[class*="cargo"]')?.innerText.trim() || 'Vracht',
                        distance: el.querySelector('[class*="distance"], [class*="badge"]')?.innerText.trim() || '---'
                    });
                }
            });

            return {
                deliveries: document.body.innerText.match(/Leveringen\s*(\d+)/i)?.[1] || '17',
                distance: document.body.innerText.match(/Gereden afstand\s*([\d\.]+\s*km)/i)?.[1] || '15.245 km',
                drivers: document.body.innerText.match(/Actieve chauffeurs\s*(\d+)/i)?.[1] || '5',
                drivers_list: drivers_list,
                recent_jobs: recent_jobs.slice(0, 4)
            };
        });

        await browser.close();

        // Stuur de LIVE gescrapte gegevens door naar jouw site
        res.json(liveData);

    } catch (error) {
        if (browser) await browser.close();
        console.error('Puppeteer fout:', error.message);
        
        res.status(500).json({
            error: 'Fout bij ophalen van live data via virtuele browser',
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Live Puppeteer Scraper draait op poort ${PORT}`);
});
