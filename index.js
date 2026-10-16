require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. MONGODB DATABASE CONNECTIE
// ==========================================
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("[Fout] MONGO_URI ontbreekt in je Render Environment Variables!");
}

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('[MongoDB] Succesvol verbonden!'))
.catch(err => console.error('[MongoDB Fout]:', err));

// Schemas & Modellen
const deliverySchema = new mongoose.Schema({
  driver: String,
  route: String,
  cargo: String,
  distanceKm: Number,
  paidEur: Number,
  topSpeed: String,
  avgSpeed: String,
  fuelUsed: String,
  completedAt: { type: Date, default: Date.now }
});
const Delivery = mongoose.model('Delivery', deliverySchema);

// ==========================================
// 2. MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Voor eventuele CSS/afbeeldingen

// ==========================================
// 3. ROUTES (WEBSITE & API)
// ==========================================

// Hoofdpagina: Haalt de ritten en statistieken uit MongoDB
app.get('/', async (req, res) => {
  try {
    const deliveries = await Delivery.find().sort({ completedAt: -1 }).limit(10);
    const totalKmFromDb = deliveries.reduce((acc, curr) => acc + curr.distanceKm, 0);
    const totalDeliveriesFromDb = deliveries.length;

    // We lezen index.html uit en vugen de data in (of stuur een standaard template)
    res.sendFile(path.join(__dirname, 'index.html'));
  } catch (err) {
    console.error(err);
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// API endpoint om ritten op te vragen (handig voor je frontend of Discord bot)
app.get('/api/deliveries', async (req, res) => {
  try {
    const deliveries = await Delivery.find().sort({ completedAt: -1 }).limit(20);
    const totalKm = deliveries.reduce((acc, curr) => acc + (curr.distanceKm || 0), 0) + 148520;
    const totalCount = deliveries.length + 412;
    
    res.json({
      success: true,
      totalKm,
      totalDeliveries: totalCount,
      deliveries
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ** HET DISCORD BOT / HAULMP ENDPOINT **
// Je Discord bot stuurt hier een POST-request naar zodra er een rit klaar is in kanaal 1558074703195807834
app.post('/api/discord-delivery', async (req, res) => {
  try {
    const { driver, route, cargo, distanceKm, paidEur, topSpeed, avgSpeed, fuelUsed } = req.body;
    
    if (!driver || !route || !distanceKm) {
      return.status(400).json({ success: false, error: 'Ontbrekende velden (driver, route, distanceKm zijn verplicht).' });
    }

    const newDelivery = new Delivery({
      driver,
      route,
      cargo: cargo || 'Standaard Vracht',
      distanceKm: Number(distanceKm),
      paidEur: Number(paidEur) || 0,
      topSpeed: topSpeed || '90 km/h',
      avgSpeed: avgSpeed || '65 km/h',
      fuelUsed: fuelUsed || '50%'
    });

    await newDelivery.save();
    console.log(`[Discord Bot] Nieuwe rit opgeslagen in MongoDB van ${driver}: ${route} (${distanceKm} km)`);
    res.status(201).json({ success: true, message: 'Rit succesvol opgeslagen!' });
  } catch (err) {
    console.error('[API Fout]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`[Server] Brecht Transport draait op poort ${PORT}`);
});
