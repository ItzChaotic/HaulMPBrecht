const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient } = require('mongodb');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1558074703195807834';
const DISCORD_APPLICATIONS_CHANNEL_ID = process.env.DISCORD_APPLICATIONS_CHANNEL_ID || '1558075393729363968';
const TARGET_BOT_ID = '1558075057417494582';
const MONGO_URI = process.env.MONGO_URI;

let db, accountsColl, announcementsColl, applicationsColl, infoColl, convoysColl, convoySignupsColl, badgesColl, eotwColl, socialsColl, jobsColl, pollsColl, absencesColl;
let isConnected = false;

let cachedAccounts = [
    { username: "DEV ACCOUNT", displayname: "Developer", password: "DEVACC123", role: "Directeur", isDev: true },
    { username: "MJGamerNL", displayname: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", displayname: "ItzChaotic", password: "ChaoticPassword!", role: "Onder Directeur & Development" },
    { username: "Ramona", displayname: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", displayname: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", displayname: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", displayname: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", displayname: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

async function connectDB() {
    const startT = Date.now();
    if (!MONGO_URI) return;
    try {
        const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        db = client.db('brecht_transport');
        
        accountsColl = db.collection('accounts');
        announcementsColl = db.collection('announcements');
        applicationsColl = db.collection('applications');
        infoColl = db.collection('info');
        convoysColl = db.collection('convoys');
        convoySignupsColl = db.collection('convoy_signups');
        badgesColl = db.collection('badges');
        eotwColl = db.collection('eotw');
        socialsColl = db.collection('socials');
        jobsColl = db.collection('jobs');
        pollsColl = db.collection('polls');
        absencesColl = db.collection('absences');

        await jobsColl.createIndex({ timestamp: -1 }).catch(() => {});
        isConnected = true;

        const count = await accountsColl.countDocuments();
        if (count === 0) {
            await accountsColl.insertMany(cachedAccounts);
        } else {
            cachedAccounts = await accountsColl.find({}).toArray();
        }
        console.log(`⏱️ MongoDB verbinding & accounts ingeladen in ${Date.now() - startT}ms`);
    } catch (err) {
        console.error("❌ MongoDB verbinding mislukt:", err.message);
    }
}
connectDB();

function cleanText(text) { return text ? text.replace(/[\*\_\`]/g, '').trim() : ''; }
function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9\,\.]/g, '').replace(',', '.')) || 0;
}

function getRoleWeight(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('directeur') && !r.includes('onder')) return 8;
    if (r.includes('onder directeur')) return 7;
    if (r.includes('management')) return 6;
    if (r.includes('leidinggevende')) return 5;
    if (r.includes('senior medewerker')) return 4;
    if (r.includes('medewerker') && !r.includes('senior') && !r.includes('junior')) return 3;
    if (r.includes('junior medewerker')) return 2;
    if (r.includes('chauffeur in opleiding')) return 1;
    return 0;
}

function getRoleColor(role) {
    const r = (role || '').toLowerCase().trim();
    if (r.includes('onder directeur')) return 'orange';
    if (r.includes('directeur')) return 'red';
    if (r.includes('management')) return 'yellow';
    if (r.includes('leidinggevende')) return 'green';
    if (r.includes('senior medewerker')) return 'blue';
    if (r.includes('medewerker')) return 'purple';
    if (r.includes('junior medewerker')) return 'cyan';
    if (r.includes('chauffeur in opleiding')) return 'gray';
    return 'gray';
}

function canManageBadges(role) {
    const r = (role || '').toLowerCase();
    return r.includes('directeur') || r.includes('management') || r.includes('leidinggevende');
}

function canManageStaff(role) {
    const r = (role || '').toLowerCase();
    return r.includes('directeur') || r.includes('onder directeur') || r.includes('management');
}

function isDriverMatch(jobDriver, accountUsername, accountDisplayname) {
    if (!jobDriver) return false;
    const j = jobDriver.toLowerCase().replace(/[^a-z0-9]/g, '');
    const u = (accountUsername || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const d = (accountDisplayname || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return j === u || j === d || j.includes(u) || u.includes(j) || (d && (j.includes(d) || d.includes(j)));
}

const clientBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

clientBot.on('clientReady', () => {
    console.log(`🤖 Discord Bot ingelogd als ${clientBot.user.tag}`);
    setTimeout(() => fetch7DaysDiscordJobs(), 500);
});

clientBot.on('messageCreate', (message) => {
    if (message.author.id !== TARGET_BOT_ID) return;
    if (message.channelId === DISCORD_CHANNEL_ID) parseAndAddJob(message);
    else if (message.channelId === DISCORD_APPLICATIONS_CHANNEL_ID) parseAndAddApplication(message);
});

async function fetch7DaysDiscordJobs() {
    try {
        const channel = await clientBot.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel) return;
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let lastId = undefined;
        let keepFetching = true;

        while (keepFetching) {
            const options = { limit: 50 };
            if (lastId) options.before = lastId;
            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            for (const msg of messages.values()) {
                if (msg.createdTimestamp < sevenDaysAgo) { keepFetching = false; break; }
                if (msg.author.id === TARGET_BOT_ID) {
                    await parseAndAddJob(msg);
                }
            }
            lastId = messages.last()?.id;
            if (messages.size < 50) break;
        }
    } catch (e) {}
}

async function parseAndAddApplication(message) {
    try {
        if (message.author.id !== TARGET_BOT_ID) return;
        let applicantName = "Sollicitant";
        let contentText = message.content || "Nieuwe sollicitatie.";
        if (message.embeds?.[0]) contentText = message.embeds[0].description || message.embeds[0].title || contentText;

        const appId = "app-" + message.id;
        if (isConnected && applicationsColl) {
            const exists = await applicationsColl.findOne({ id: appId });
            if (!exists) {
                await applicationsColl.insertOne({
                    id: appId, applicant: applicantName, content: contentText, status: "open",
                    date: new Date(message.createdTimestamp || Date.now()).toLocaleDateString('nl-NL'),
                    link: "https://vtc.haulmp.com/Brecht#applications"
                });
            }
        }
    } catch(e) {}
}

async function parseAndAddJob(message) {
    try {
        let from = '', to = '', driver = '', cargo = 'Vracht', distanceStr = '0 km', paidAmount = 0;
        let timestamp = message.createdTimestamp || Date.now();

        if (message.embeds?.[0]) {
            const embed = message.embeds[0];
            const title = embed.title || '';
            if (title.includes('→')) { const p = title.split('→'); from = cleanText(p[0]); to = cleanText(p[1]); }
            embed.fields?.forEach(f => {
                if (f.name.toLowerCase().includes('driver')) driver = cleanText(f.value);
                if (f.name.toLowerCase().includes('distance')) distanceStr = cleanText(f.value);
                if (f.name.toLowerCase().includes('paid')) paidAmount = parseCurrency(f.value);
            });
        }
        if (!from || !to) return;
        if (!driver) driver = cleanText(message.author.username);
        const kmAmount = parseInt(distanceStr.replace(/\D/g, ''), 10) || 0;
        if (paidAmount === 0 && kmAmount > 0) paidAmount = kmAmount * 35;

        const jobObj = { id: message.id || "job-" + Date.now(), from, to, driver, cargo, distance: `${kmAmount.toLocaleString('nl-NL')} km`, kmAmount, paidAmount, timestamp, dateFormatted: new Date(timestamp).toLocaleDateString('nl-NL') };
        if (isConnected && jobsColl) {
            await jobsColl.updateOne({ id: jobObj.id }, { $set: jobObj }, { upsert: true });
        }
    } catch(e) {}
}

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const account = cachedAccounts.find(acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password);
        if (!account) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });
        
        res.json({ 
            success: true, username: account.username, displayname: account.displayname || account.username, role: account.role, color: getRoleColor(account.role), 
            discordId: account.discordId || '', avatarUrl: account.avatarUrl || '', 
            canManageBadges: canManageBadges(account.role), canManageStaff: canManageStaff(account.role)
        });
    } catch(e) {
        res.status(500).json({ success: false, message: "Serverfout" });
    }
});

app.get('/api/haulmp', async (req, res) => {
    try {
        const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
        let allJobsHistory = [];
        
        if (isConnected && jobsColl) {
            allJobsHistory = await jobsColl.find({ timestamp: { $gte: tenDaysAgo } }).sort({ timestamp: -1 }).toArray();
        }

        const totalDeliveries = allJobsHistory.length;
        const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
        const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidAmount, 0);

        let customBadges = [], announcementsList = [], applicationsList = [], infoList = [], convoysList = [], convoySignupsList = [], socialsList = [], pollsList = [], absencesList = [];
        let employeeOfTheWeek = { username: "MJGamerNL", reason: "Uitstekende inzet!" };

        if (isConnected && db) {
            const fetchWithTimeout = (promise, ms = 1500) => Promise.race([promise, new Promise(resolve => resolve([]))]);

            try {
                const [badges, announcements, applications, info, convoys, signups, socials, polls, absences, eotw] = await Promise.all([
                    fetchWithTimeout(badgesColl.find({}).toArray()),
                    fetchWithTimeout(announcementsColl.find({}).sort({ _id: -1 }).toArray()),
                    fetchWithTimeout(applicationsColl.find({}).toArray()),
                    fetchWithTimeout(infoColl.find({}).sort({ _id: -1 }).toArray()),
                    fetchWithTimeout(convoysColl.find({}).sort({ _id: -1 }).toArray()),
                    fetchWithTimeout(convoySignupsColl.find({}).toArray()),
                    fetchWithTimeout(socialsColl.find({}).sort({ _id: -1 }).toArray()),
                    fetchWithTimeout(pollsColl.find({}).sort({ _id: -1 }).toArray()),
                    fetchWithTimeout(absencesColl.find({}).sort({ _id: -1 }).toArray()),
                    fetchWithTimeout(eotwColl.findOne({}), 1000)
                ]);

                customBadges = badges || []; announcementsList = announcements || []; applicationsList = applications || [];
                infoList = info || []; convoysList = convoys || []; convoySignupsList = signups || []; socialsList = socials || [];
                pollsList = polls || []; absencesList = absences || [];
                if (eotw && !Array.isArray(eotw)) employeeOfTheWeek = eotw;
            } catch (e) {}
        }

        let formattedDrivers = cachedAccounts.map(m => {
            const userJobs = allJobsHistory.filter(j => isDriverMatch(j.driver, m.username, m.displayname));
            return {
                username: m.username, displayname: m.displayname || m.username, role: m.role, weight: getRoleWeight(m.role), color: getRoleColor(m.role), isDev: !!m.isDev,
                avatarUrl: m.avatarUrl || '', discordId: m.discordId || '',
                deliveries: userJobs.length,
                distance: `${userJobs.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
                earnings: `€ ${userJobs.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
                badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
            };
        });
        formattedDrivers.sort((a, b) => b.weight - a.weight);

        const dailyChartData = {};
        for (let i = 9; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
            dailyChartData[dateStr] = { date: dateStr, company: 0, drivers: {} };
        }

        allJobsHistory.forEach(j => {
            const dStr = new Date(j.timestamp).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
            if (dailyChartData[dStr]) {
                dailyChartData[dStr].company += j.paidAmount;
                const dc = j.driver.toLowerCase().replace(/[^a-z0-9]/g, '');
                dailyChartData[dStr].drivers[dc] = (dailyChartData[dStr].drivers[dc] || 0) + j.paidAmount;
            }
        });

        res.json({
            deliveries: totalDeliveries.toString(),
            distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
            companyEarnings: `€ ${totalCompanyEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            drivers: formattedDrivers.filter(d => !d.isDev).length.toString(),
            drivers_list: formattedDrivers,
            recent_jobs: allJobsHistory.slice(0, 10),
            badges: customBadges, announcements: announcementsList, applications: applicationsList,
            infoList, convoysList, convoySignupsList, socialsList, pollsList, absencesList, employeeOfTheWeek,
            dailyChartData: Object.values(dailyChartData)
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Werving: Gebruiker toevoegen
app.post('/api/werving/add', async (req, res) => {
    const { username, displayname, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Vul gebruikersnaam en wachtwoord in.' });
    
    const newAcc = { 
        username: username.trim(), 
        displayname: (displayname || username).trim(), 
        password: password.trim(), 
        role: role || 'Chauffeur in opleiding' 
    };

    if (isConnected && accountsColl) {
        await accountsColl.insertOne(newAcc);
        cachedAccounts = await accountsColl.find({}).toArray();
    } else {
        cachedAccounts.push(newAcc);
    }
    res.json({ success: true });
});

// Update Volledig Personeelslid
app.post('/api/staff/update-full', async (req, res) => {
    const { oldUsername, username, displayname, role, password } = req.body;
    if (isConnected && accountsColl) {
        const updateDoc = { username, displayname, role };
        if (password) updateDoc.password = password;
        await accountsColl.updateOne({ username: oldUsername }, { $set: updateDoc });
        cachedAccounts = await accountsColl.find({}).toArray();
    }
    res.json({ success: true });
});

// Verwijderen & Aanmaken via API
app.delete('/api/announcements/:id', async (req, res) => {
    if (isConnected && announcementsColl) await announcementsColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.delete('/api/info/:id', async (req, res) => {
    if (isConnected && infoColl) await infoColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.delete('/api/convoys/:id', async (req, res) => {
    if (isConnected && convoysColl) {
        await convoysColl.deleteOne({ id: req.params.id });
        if (convoySignupsColl) await convoySignupsColl.deleteMany({ convoyId: req.params.id });
    }
    res.json({ success: true });
});

app.post('/api/convoys/signup', async (req, res) => {
    const { convoyId, username, status } = req.body;
    if (isConnected && convoySignupsColl) {
        await convoySignupsColl.updateOne({ convoyId, username }, { $set: { convoyId, username, status, date: new Date().toLocaleDateString('nl-NL') } }, { upsert: true });
    }
    res.json({ success: true });
});

app.post('/api/convoys/cancel', async (req, res) => {
    const { convoyId, username } = req.body;
    if (isConnected && convoySignupsColl) await convoySignupsColl.deleteOne({ convoyId, username });
    res.json({ success: true });
});

app.post('/api/absence', async (req, res) => {
    const { from, to, reason, username } = req.body;
    const item = { id: "abs-" + Date.now(), username, from, to, reason, status: 'In Afwachting', date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && absencesColl) await absencesColl.insertOne(item);
    res.json({ success: true });
});

app.post('/api/absence/status', async (req, res) => {
    const { absId, status } = req.body;
    if (isConnected && absencesColl) await absencesColl.updateOne({ id: absId }, { $set: { status } });
    res.json({ success: true });
});

app.post('/api/staff/upload-pfp', async (req, res) => {
    const { targetUser, pfp } = req.body;
    if (isConnected && accountsColl) {
        await accountsColl.updateOne({ username: { $regex: new RegExp(`^${targetUser}$`, 'i') } }, { $set: { avatarUrl: pfp } });
        cachedAccounts = await accountsColl.find({}).toArray();
    }
    res.json({ success: true, avatarUrl: pfp });
});

app.post('/api/applications/complete', async (req, res) => {
    if (isConnected && applicationsColl) await applicationsColl.updateOne({ id: req.body.appId }, { $set: { status: "completed" } });
    res.json({ success: true });
});

app.post('/api/badges', async (req, res) => {
    const { title, targetUser } = req.body;
    const badgeObj = { id: "badge-" + Date.now(), title: title.trim(), targetUser: targetUser.trim(), date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && badgesColl) await badgesColl.insertOne(badgeObj);
    res.json({ success: true });
});

app.post('/api/badges/delete', async (req, res) => {
    if (isConnected && badgesColl) await badgesColl.deleteOne({ id: req.body.badgeId });
    res.json({ success: true });
});

app.post('/api/info', upload.single('file'), async (req, res) => {
    let fileLink = req.body.link || '';
    if (req.file) fileLink = `data:${req.file.mimetype};base64,${Buffer.from(req.file.buffer).toString('base64')}`;
    const infoObj = { id: "info-" + Date.now(), title: req.body.title, content: req.body.content, link: fileLink, fileName: req.file ? req.file.originalname : null, username: req.body.username, date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && infoColl) await infoColl.insertOne(infoObj);
    res.json({ success: true });
});

app.post('/api/convoys', async (req, res) => {
    const convObj = { id: "conv-" + Date.now(), ...req.body, img: req.body.img || 'https://raw.githubusercontent.com/ItzChaotic/Random-Pics/main/3%20Trucksinlog.png' };
    if (isConnected && convoysColl) await convoysColl.insertOne(convObj);
    res.json({ success: true });
});

app.post('/api/eotw', async (req, res) => {
    if (isConnected && eotwColl) {
        await eotwColl.deleteMany({});
        await eotwColl.insertOne({ username: req.body.targetUser, reason: req.body.reason, setBy: req.body.username });
    }
    res.json({ success: true });
});

app.post('/api/announcements', async (req, res) => {
    const annObj = { id: "ann-" + Date.now(), ...req.body, date: new Date().toLocaleDateString('nl-NL') };
    if (isConnected && announcementsColl) await announcementsColl.insertOne(annObj);
    res.json({ success: true });
});

app.post('/api/socials', async (req, res) => {
    const { platform, url, username } = req.body;
    const socialObj = { id: "soc-" + Date.now(), platform: platform.trim(), url: url.trim(), addedBy: username || 'Admin' };
    if (isConnected && socialsColl) await socialsColl.insertOne(socialObj);
    res.json({ success: true });
});

app.delete('/api/socials/:id', async (req, res) => {
    if (isConnected && socialsColl) await socialsColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.post('/api/staff/update-password', async (req, res) => {
    if (isConnected && accountsColl) {
        await accountsColl.updateOne({ username: { $regex: new RegExp(`^${req.body.targetUser}$`, 'i') } }, { $set: { password: req.body.newPassword.trim() } });
        cachedAccounts = await accountsColl.find({}).toArray();
    }
    res.json({ success: true });
});

app.delete('/api/staff/:targetUser', async (req, res) => {
    if (isConnected && accountsColl) {
        await accountsColl.deleteOne({ username: { $regex: new RegExp(`^${req.params.targetUser}$`, 'i') } });
        cachedAccounts = await accountsColl.find({}).toArray();
    }
    res.json({ success: true });
});

if (DISCORD_BOT_TOKEN) {
    clientBot.login(DISCORD_BOT_TOKEN).catch(err => {});
}

app.listen(PORT, () => console.log(`🚀 Server actief op poort ${PORT}`));
