const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient } = require('mongodb');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.use(express.static(__dirname));
app.use('/api', (req, res, next) => { if (req.method !== 'GET' && req.method !== 'HEAD') haulmpCache = null; next(); });


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
const MONGO_URI = process.env.MONGO_URI;

let db, accountsColl, announcementsColl, applicationsColl, infoColl, convoysColl, convoySignupsColl, badgesColl, eotwColl, socialsColl, jobsColl, syncStateColl;
let haulmpCache = null;
let haulmpCacheAt = 0;
const HAULMP_CACHE_TTL_MS = 10000;
let isConnected = false;

let cachedAccounts = [
    { username: "DEV ACCOUNT", password: "DEVACC123", role: "Directeur", isDev: true },
    { username: "MJGamerNL", password: "Wachtwoord123", role: "Directeur" },
    { username: "ItzChaotic_", password: "ChaoticPassword!", role: "Onder Directeur & Development" },
    { username: "Ramona", password: "RamonaPass2026", role: "Onder Directeur" },
    { username: "JoeyKj", password: "JoeyPassword", role: "Management" },
    { username: "Jellybear", password: "JellyBearPass", role: "Management" },
    { username: "Dansco54", password: "DanscoPass", role: "Leidinggevende" },
    { username: "Zinnorax", password: "ZinnoraxPass", role: "Leidinggevende" }
];

async function connectDB() {
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
        syncStateColl = db.collection('sync_state');

        await Promise.all([
            jobsColl.createIndex({ timestamp: -1 }),
            jobsColl.createIndex({ id: 1 }, { unique: true }),
            announcementsColl.createIndex({ _id: -1 }),
            convoysColl.createIndex({ _id: -1 }),
            infoColl.createIndex({ _id: -1 }),
            socialsColl.createIndex({ _id: -1 })
        ].map(p => p.catch(() => {})));
        isConnected = true;

        const count = await accountsColl.countDocuments();
        if (count === 0) {
            await accountsColl.insertMany(cachedAccounts);
        } else {
            cachedAccounts = await accountsColl.find({}).toArray();
        }
        console.log("✅ Verbonden met MongoDB Atlas & accounts gecached!");
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
    return r.includes('directeur') || r.includes('onder directeur');
}

function canDeleteContent(role) {
    const r = (role || '').toLowerCase();
    return r.includes('directeur') || r.includes('onder directeur') || r.includes('management');
}

function isDriverMatch(jobDriver, accountUsername) {
    if (!jobDriver || !accountUsername) return false;
    const j = jobDriver.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = accountUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    return j === a || j.includes(a) || a.includes(j);
}

function getISOWeekKey(timestamp) {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `Wk ${weekNo}`;
}

const clientBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

clientBot.on('clientReady', () => {
    console.log(`🤖 Discord Bot ingelogd als ${clientBot.user.tag}`);
    setTimeout(() => fetch10DaysDiscordJobs(), 2000);
});

clientBot.on('messageCreate', (message) => {
    if (message.channelId === DISCORD_CHANNEL_ID) parseAndAddJob(message);
    else if (message.channelId === DISCORD_APPLICATIONS_CHANNEL_ID) parseAndAddApplication(message);
});

async function fetch10DaysDiscordJobs() {
    // First boot: import at most the latest 10 days. Later boots only fetch messages
    // posted after the saved Discord message ID, rather than rescanning the history.
    try {
        const channel = await clientBot.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel || !channel.messages || !isConnected || !jobsColl || !syncStateColl) return;

        const state = await syncStateColl.findOne({ _id: 'discord_jobs' });
        let lastMessageId = state?.lastMessageId || null;
        const isInitialSync = !lastMessageId;
        const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
        let cursor = lastMessageId || undefined;
        let newestSeenId = lastMessageId;
        let keepFetching = true;
        let imported = 0;

        while (keepFetching) {
            const options = { limit: 100 };
            if (isInitialSync && cursor) options.before = cursor;
            else if (!isInitialSync && cursor) options.after = cursor;
            const messages = await channel.messages.fetch(options);
            if (!messages.size) break;

            const ordered = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            if (!newestSeenId || ordered[ordered.length - 1].createdTimestamp > (state?.lastTimestamp || 0)) {
                newestSeenId = ordered[ordered.length - 1].id;
            }

            const jobs = [];
            for (const msg of ordered) {
                if (isInitialSync && msg.createdTimestamp < tenDaysAgo) {
                    keepFetching = false;
                    continue;
                }
                if (msg.channelId !== DISCORD_CHANNEL_ID) continue;
                const job = parseJobMessage(msg);
                if (job) jobs.push({ updateOne: { filter: { id: job.id }, update: { $set: job }, upsert: true } });
            }
            if (jobs.length) {
                await jobsColl.bulkWrite(jobs, { ordered: false });
                imported += jobs.length;
            }

            if (isInitialSync) {
                // Walk backwards until the 10-day boundary; cursor is the oldest ID in this batch.
                cursor = ordered[0]?.id;
                if (messages.size < 100 || ordered[0]?.createdTimestamp < tenDaysAgo) keepFetching = false;
            } else {
                // `after` returns newer messages; advance to the newest ID to catch up next batch.
                cursor = ordered[ordered.length - 1]?.id;
                if (messages.size < 100) keepFetching = false;
            }
        }

        // On the first run, anchor incremental sync at the latest channel message, not the oldest imported job.
        if (isInitialSync) {
            const newest = await channel.messages.fetch({ limit: 1 });
            newestSeenId = newest.first()?.id || newestSeenId;
        }
        if (newestSeenId) {
            await syncStateColl.updateOne(
                { _id: 'discord_jobs' },
                { $set: { lastMessageId: newestSeenId, lastTimestamp: Date.now(), updatedAt: new Date() } },
                { upsert: true }
            );
        }
        console.log(`Discord-ritten synchronisatie klaar (${imported} ritten verwerkt; incrementeel).`);
    } catch (e) {
        console.error('Discord-ritten synchronisatie mislukt:', e.message);
    }
}

function parseJobMessage(message) {
    try {
        let from = '', to = '', driver = '', cargo = 'Vracht', distanceStr = '0 km', paidAmount = 0;
        const timestamp = message.createdTimestamp || Date.now();
        if (message.embeds?.[0]) {
            const embed = message.embeds[0];
            const title = embed.title || '';
            if (title.includes('→')) { const p = title.split('→'); from = cleanText(p[0]); to = cleanText(p[1]); }
            embed.fields?.forEach(f => {
                const name = (f.name || '').toLowerCase();
                if (name.includes('driver')) driver = cleanText(f.value);
                if (name.includes('distance')) distanceStr = cleanText(f.value);
                if (name.includes('paid')) paidAmount = parseCurrency(f.value);
            });
        }
        if (!from || !to) return null;
        if (!driver) driver = cleanText(message.author?.username || 'Onbekend');
        const kmAmount = parseInt(distanceStr.replace(/\D/g, ''), 10) || 0;
        if (paidAmount === 0 && kmAmount > 0) paidAmount = kmAmount * 35;
        return { id: message.id || `job-${timestamp}`, from, to, driver, cargo, distance: `${kmAmount.toLocaleString('nl-NL')} km`, kmAmount, paidAmount, timestamp, weekKey: getISOWeekKey(timestamp), dateFormatted: new Date(timestamp).toLocaleDateString('nl-NL') };
    } catch (_) { return null; }
}

async function parseAndAddApplication(message) {
    try {
        const applicantName = message.author ? message.author.username : "Sollicitant";
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
        const jobObj = parseJobMessage(message);
        if (!jobObj || !isConnected || !jobsColl) return;
        await jobsColl.updateOne({ id: jobObj.id }, { $set: jobObj }, { upsert: true });
        haulmpCache = null;
    } catch (e) { console.error('Rit opslaan mislukt:', e.message); }
}

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const account = cachedAccounts.find(acc => acc.username.toLowerCase() === (username || '').trim().toLowerCase() && acc.password === password);
        if (!account) return res.status(401).json({ success: false, message: 'Onjuiste gegevens!' });
        
        res.json({ 
            success: true, 
            username: account.username, 
            role: account.role, 
            color: getRoleColor(account.role), 
            discordId: account.discordId || '', 
            
            canManageBadges: canManageBadges(account.role), 
            canManageStaff: canManageStaff(account.role),
            canDelete: canDeleteContent(account.role)
        });
    } catch(e) {
        res.status(500).json({ success: false, message: "Serverfout" });
    }
});

app.get('/api/haulmp', async (req, res) => {
    try {
        if (haulmpCache && Date.now() - haulmpCacheAt < HAULMP_CACHE_TTL_MS) return res.json(haulmpCache);
        const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
        let allJobsHistory = [];
        
        if (isConnected && jobsColl) {
            allJobsHistory = await jobsColl.find({ timestamp: { $gte: tenDaysAgo } }).sort({ timestamp: -1 }).toArray();
        }

        const totalDeliveries = allJobsHistory.length;
        const totalDistanceKm = allJobsHistory.reduce((acc, curr) => acc + curr.kmAmount, 0);
        const totalCompanyEarnings = allJobsHistory.reduce((acc, curr) => acc + curr.paidAmount, 0);

        let customBadges = [];
        let announcementsList = [];
        let applicationsList = [];
        let infoList = [];
        let convoysList = [];
        let convoySignupsList = [];
        let socialsList = [];
        let employeeOfTheWeek = { username: "MJGamerNL", reason: "Uitstekende inzet!" };

        if (isConnected && db) {
            try {
                const [badges, announcements, applications, info, convoys, signups, socials, eotw] = await Promise.all([
                    badgesColl.find({}).limit(250).toArray(),
                    announcementsColl.find({}).sort({ _id: -1 }).limit(30).toArray(),
                    applicationsColl.find({}).sort({ _id: -1 }).limit(100).toArray(),
                    infoColl.find({}).sort({ _id: -1 }).limit(50).toArray(),
                    convoysColl.find({}).sort({ _id: -1 }).limit(50).toArray(),
                    convoySignupsColl.find({}).limit(500).toArray(),
                    socialsColl.find({}).sort({ _id: -1 }).limit(30).toArray(),
                    eotwColl.findOne({})
                ]);
                customBadges = badges;
                announcementsList = announcements;
                applicationsList = applications;
                infoList = info;
                convoysList = convoys;
                convoySignupsList = signups;
                socialsList = socials;
                if (eotw) employeeOfTheWeek = eotw;
            } catch (e) {}
        }

        let formattedDrivers = cachedAccounts.map(m => {
            const userJobs = allJobsHistory.filter(j => isDriverMatch(j.driver, m.username));
            return {
                username: m.username, role: m.role, weight: getRoleWeight(m.role), color: getRoleColor(m.role), isDev: !!m.isDev,
                discordId: m.discordId || '',
                deliveries: userJobs.length,
                distance: `${userJobs.reduce((a, c) => a + c.kmAmount, 0).toLocaleString('nl-NL')} km`,
                earnings: `€ ${userJobs.reduce((a, c) => a + c.paidAmount, 0).toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
                userJobs: userJobs.slice(0, 15),
                badges: customBadges.filter(b => b.targetUser.toLowerCase() === m.username.toLowerCase())
            };
        });

        formattedDrivers.sort((a, b) => b.weight - a.weight);

        const weeklyChartData = {};
        allJobsHistory.forEach(j => {
            const w = j.weekKey || 'Wk 1';
            if (!weeklyChartData[w]) weeklyChartData[w] = { week: w, company: 0, drivers: {} };
            weeklyChartData[w].company += j.paidAmount;
            const dc = j.driver.toLowerCase().replace(/[^a-z0-9]/g, '');
            weeklyChartData[w].drivers[dc] = (weeklyChartData[w].drivers[dc] || 0) + j.paidAmount;
        });

        const payload = {
            deliveries: totalDeliveries.toString(),
            distance: `${totalDistanceKm.toLocaleString('nl-NL')} km`,
            companyEarnings: `€ ${totalCompanyEarnings.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`,
            drivers: formattedDrivers.filter(d => !d.isDev).length.toString(),
            drivers_list: formattedDrivers,
            recent_jobs: allJobsHistory.slice(0, 10),
            badges: customBadges,
            announcements: announcementsList, applications: applicationsList,
            infoList, convoysList, convoySignupsList, socialsList, employeeOfTheWeek,
            weeklyChartData: Object.values(weeklyChartData).reverse()
        };
        haulmpCache = payload;
        haulmpCacheAt = Date.now();
        res.json(payload);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});



app.post('/api/applications/complete', async (req, res) => {
    if (isConnected && applicationsColl) await applicationsColl.updateOne({ id: req.body.appId }, { $set: { status: "completed" } });
    res.json({ success: true });
});

app.post('/api/badges', async (req, res) => {
    const { title, targetUser } = req.body;
    if (!title || !targetUser) return res.status(400).json({ success: false, message: 'Vul alle velden in.' });
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
    if (req.file) {
        fileLink = `data:${req.file.mimetype};base64,${Buffer.from(req.file.buffer).toString('base64')}`;
    }
    const infoObj = { 
        id: "info-" + Date.now(), title: req.body.title, content: req.body.content, 
        link: fileLink, fileName: req.file ? req.file.originalname : null,
        username: req.body.username, date: new Date().toLocaleDateString('nl-NL') 
    };
    if (isConnected && infoColl) await infoColl.insertOne(infoObj);
    res.json({ success: true });
});

app.delete('/api/info/:id', async (req, res) => {
    if (isConnected && infoColl) await infoColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.post('/api/convoys', async (req, res) => {
    const convObj = { id: "conv-" + Date.now(), ...req.body };
    if (isConnected && convoysColl) await convoysColl.insertOne(convObj);
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
    const { convoyId, username } = req.body;
    if (!convoyId || !username) return res.status(400).json({ success: false });
    if (isConnected && convoySignupsColl) {
        await convoySignupsColl.updateOne(
            { convoyId, username },
            { $set: { convoyId, username, date: new Date().toLocaleDateString('nl-NL') } },
            { upsert: true }
        );
    }
    res.json({ success: true });
});

app.post('/api/convoys/cancel', async (req, res) => {
    const { convoyId, username } = req.body;
    if (isConnected && convoySignupsColl) {
        await convoySignupsColl.deleteOne({ convoyId, username });
    }
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

app.delete('/api/announcements/:id', async (req, res) => {
    if (isConnected && announcementsColl) await announcementsColl.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

app.post('/api/socials', async (req, res) => {
    const { platform, url, username } = req.body;
    if (!platform || !url) return res.status(400).json({ success: false, message: 'Vul alle velden in.' });
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

app.post('/api/staff/add', async (req, res) => {
    const pw = "Brecht" + Math.floor(1000 + Math.random() * 9000);
    const newAcc = { username: req.body.username.trim(), password: pw, role: req.body.role.trim() };
    if (isConnected && accountsColl) {
        const exists = await accountsColl.findOne({ username: { $regex: new RegExp(`^${req.body.username.trim()}$`, 'i') } });
        if (exists) return res.status(400).json({ success: false, message: 'Bestaat al.' });
        await accountsColl.insertOne(newAcc);
        cachedAccounts = await accountsColl.find({}).toArray();
    }
    res.json({ success: true, message: pw });
});

app.post('/api/staff/update-role', async (req, res) => {
    if (isConnected && accountsColl) {
        await accountsColl.updateOne({ username: { $regex: new RegExp(`^${req.body.targetUser}$`, 'i') } }, { $set: { role: req.body.newRole.trim() } });
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
