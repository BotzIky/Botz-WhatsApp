const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeInMemoryStore,
    getContentType,
    downloadContentFromMessage,
    proto,
    jidDecode,
    DisconnectReason,
} = require("@whiskeysockets/baileys");
const cron = require('node-cron');
const pino = require("pino");
const readline = require("readline");
const chalk = require("chalk");
const NodeCache = require("node-cache");
const msgRetryCounterCache = new NodeCache();
const fs = require('fs');
const path = require('path');

const log = {
    info: (text) => console.log(chalk.blue('ℹ️ [INFO]'), chalk.cyan(text)),
    success: (text) => console.log(chalk.green('✅ [SUCCESS]'), chalk.green(text)),
    error: (text) => console.log(chalk.red('❌ [ERROR]'), chalk.red(text)),
    warn: (text) => console.log(chalk.yellow('⚠️ [WARNING]'), chalk.yellow(text)),
    system: (text) => console.log(chalk.magenta('🔄 [SYSTEM]'), chalk.magenta(text))
};

const PHONENUMBER_MCC = {
    '62': 'ID',
    '60': 'MY',
    '65': 'SG',
    '66': 'TH',
    '84': 'VN',
    '856': 'LA',
    '855': 'KH',
    '880': 'BD',
    '91': 'IN'
};

const Database = require('./database');
const db = new Database('database.json');

let usersCollection;

async function initDatabase() {
    await db.load();
    usersCollection = db;
    log.success('Database initialized successfully');
}
initDatabase().catch(err => log.error('Database initialization failed: ' + err));

const store = makeInMemoryStore({
    logger: pino().child({ level: "silent", stream: "store" }),
});

const { smsg } = require('./lib/myfunc');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions')
    
    const iky = makeWASocket({
      printQRInTerminal: false, 
      logger: pino({ level: 'silent' }),
      browser: ['Mac OS', 'chrome', '121.0.6167.159'],
      auth: state,
      markOnlineOnConnect: true,
      msgRetryCounterCache, 
      defaultQueryTimeoutMs: undefined,
    });

    store.bind(iky.ev)

    if (!iky.authState.creds.registered) {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(chalk.cyan('Please enter your WhatsApp number (Example: 628xxxxxx): '), async (number) => {
            let phoneNumber = number.replace(/[^0-9]/g, '');
 
            if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) {
                log.error("Start with country code of your WhatsApp number, (Example: 628xxxxxx)");
                process.exit(0);
            }
            
            try {
                const code = await iky.requestPairingCode(phoneNumber);
                log.success(`Your pairing code: ${chalk.bold.green(code)}`);
                rl.close();
            } catch (error) {
                log.error('Failed to request code: ' + error);
                rl.close();
            }
        });
    } else {
        log.success('Connected to WhatsApp');
    }

    iky.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await iky.readMessages([mek.key]);
            }
            iky.readMessages([mek.key]);
            m = smsg(iky, mek, store);
            const fatkuns = m && (m.quoted || m);
            const quoted = (fatkuns?.mtype == 'buttonsMessage') ? fatkuns[Object.keys(fatkuns)[1]] : (fatkuns?.mtype == 'templateMessage') ? fatkuns.hydratedTemplate[Object.keys(fatkuns.hydratedTemplate)[1]] : (fatkuns?.mtype == 'product') ? fatkuns[Object.keys(fatkuns)[0]] : m.quoted || m;
            const mime = (quoted.msg || quoted).mimetype || ''
            const dateNow = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
            const chatId = Math.random().toString(36).substring(2, 50);
            const user = await usersCollection.findOne({ userId: m.sender });
            if (!mek.key.fromMe && !user && !m.isGroup) {
                await usersCollection.insertOne({
                    userId: m.sender,
                    chatId: chatId,
                    premium: false,
                    limit: 30,
                    firstUse: dateNow
                });
                log.info('New user added to database');
            }
            if (m.text.startsWith('/id')) {
                await m.reply(`\`[ Identification ]\`\n\n${m.sender}`);
                log.info(`ID request from ${m.sender}`);
                return;
            } else if (mek && m.text.startsWith('/ping') && !m.key.fromMe) {
                await m.reply('pong');
                log.info(`Ping request from ${m.sender}`);
                return;
            } else if (mek && !/sticker|audio|image|video/.test(mime) && !mek.key.fromMe && !m.sender.includes('newsletter') && !m.text.startsWith('/id') && !m.text.startsWith('/ping') && !m.text.startsWith('/new') && !m.isGroup) {
                const user = await usersCollection.findOne({ userId: m.sender });
                const id = user.chatId;
                await iky.sendPresenceUpdate('composing', m.chat);
                const chatGPT = require('./lib/chatgpt');
                await chatGPT(m, iky, m.text, id);
                log.info(`ChatGPT response sent to ${m.sender}`);
                return;
            } else if (m.text.startsWith('/new') && !m.isGroup) {
                const chatId = Math.random().toString(36).substring(2, 50);
                await usersCollection.updateOne(
                    { userId: m.sender },
                    { $set: { chatId: chatId } }
                );
                const mid = `Sesi baru/obrolan baru berhasil dibuat.`
                const med = `New session/new chat successfully created.`
                await m.reply(`\`[ System AI ]\`\n\n${m.sender.startsWith('62') ? mid : med}`)
                log.success(`New chat session created for ${m.sender}`);
                return;
            } else if (mek && /sticker|audio|image|video/.test(mime) && !mek.key.fromMe && !m.sender.includes('newsletter') && !m.isGroup) {
                const user = await usersCollection.findOne({ userId: m.sender });
                if (!fs.existsSync(`./temp/${m.sender}`)) {
                    fs.mkdirSync(`./temp/${m.sender}`, { recursive: true });
                }
                if (mek && /image/.test(mime)) {
                    let media = await quoted.download();
                    fs.writeFileSync(`./temp/${m.sender}/gambar.jpg`, media);
                    await usersCollection.updateOne(
                        { userId: m.sender },
                        { $set: { path: `./temp/${m.sender}/gambar.jpg`, type: 'image' } }
                    );
                    log.info(`Image received from ${m.sender}`);
                } else if (mek && /video/.test(mime) || /audio/.test(mime)) {
                    const user = await usersCollection.findOne({ userId: m.sender });
                    const id = user.chatId;
                    const chatGPT = require('./lib/chatgpt');
                    await chatGPT(m, iky, m.text, id);
                    log.info(`Media message processed for ${m.sender}`);
                    return;
                }
                const askMedia = require('./lib/chatgpt2');
                await askMedia(m, iky, m.text, usersCollection);
                return;
            }
        } catch (err) {
            log.error('Error in message handling: ' + err);
        }
    });

    iky.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
        } else {
            return jid;
        }
    };

    iky.sendText = (jid, text, quoted = '', options) => {
        iky.sendMessage(jid, { text: text, ...options }, { quoted });
        return iky;
    }

    iky.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || '';
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
        const stream = await downloadContentFromMessage(message, messageType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    }

    iky.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                log.warn('Connection closed, attempting to reconnect...');
                connectToWhatsApp();
            } else {
                log.error('Connection closed. You are logged out.');
            }
        }
        if (connection === 'open') {
            log.success('WhatsApp connection established');
        }
    });

    iky.ev.on('creds.update', saveCreds);

    return iky;
}

connectToWhatsApp().catch((err) => log.error('Connection Error: ' + err));