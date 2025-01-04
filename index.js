const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeInMemoryStore,
    getContentType,
    downloadContentFromMessage,
    proto,
    jidDecode,
    DisikyectReason,
} = require("@whiskeysockets/baileys");
const cron = require('node-cron');
const pino = require("pino");
const readline = require("readline");
const chalk = require("chalk");
const NodeCache = require("node-cache");
const msgRetryCounterCache = new NodeCache();
const fs = require('fs');
const path = require('path');

const Database = require('./database');
const db = new Database('database.json');

let usersCollection;

async function initDatabase() {
    await db.load();
    usersCollection = db;
    console.log("Database initialized successfully");
}
initDatabase().catch(console.error);

global.sessionName = "sessions";
const pairingCode = process.argv.includes("-pairing");

if (!pairingCode) {
    console.log(chalk.redBright("Use -pairing"));
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const store = makeInMemoryStore({
    logger: pino().child({ level: "silent", stream: "store" }),
});

const { smsg } = require('./lib/myfunc');

async function startServer() {
    const child = async () => {
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions`);
        const iky = makeWASocket({
            printQRInTerminal: !pairingCode,
            logger: pino({ level: "silent" }),
            auth: state,
        });

        iky.ev.on("creds.update", saveCreds);

        if (pairingCode && !iky.authState.creds.registered) {
            console.clear();
            console.log(chalk.cyan('📨 Please type your WhatsApp number:'));
            let phoneNumber = await question(`   ${chalk.cyan('- Number')}: `);
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            let code = await iky.requestPairingCode(phoneNumber);
            console.log(chalk.cyan(`Your Pairing Code: ${code}`));
            rl.close();
        }

        store.bind(iky.ev);

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
                    console.log('Add new User');
                }
                if (m.text.startsWith('/id')) {
                    await m.reply(`\`[ Identification ]\`\n\n${m.sender}`);
                    return;
                } else if (mek && m.text.startsWith('/ping') && !m.key.fromMe) {
                    await m.reply('pong');
                    return;
                } else if (mek && !/sticker|audio|image|video/.test(mime) && !mek.key.fromMe && !m.sender.includes('newsletter') && !m.text.startsWith('/id') && !m.text.startsWith('/ping') && !m.isGroup) {
                    const user = await usersCollection.findOne({ userId: m.sender });
                    const id = user.chatId;
                    await iky.sendPresenceUpdate('composing', m.chat);
                    const chatGPT = require('./lib/chatgpt');
                    await chatGPT(m, iky, m.text, id);
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
                    return;
                } else if (mek && /sticker|audio|image|video/.test(mime) && !mek.key.fromMe && !m.sender.includes('newsletter') && !m.isGroup) {
                    const user = await usersCollection.findOne({ userId: m.sender });
                    if (!fs.existsSync(`./temp/${m.sender}`)) {
                        fs.mkdirSync(`./temp/${m.sender}`);
                    }
                    if (mek && /image/.test(mime)) {
                        let media = await quoted.download();
                        fs.writeFileSync(`./temp/${m.sender}/gambar.jpg`, media);
                        await usersCollection.updateOne(
                            { userId: m.sender },
                            { $set: { path: `./temp/${m.sender}/gambar.jpg`, type: 'image' } }
                        );
                    } else if (mek && /video/.test(mime) || /audio/.test(mime)) {
                        const user = await usersCollection.findOne({ userId: m.sender });
                        const id = user.chatId;
                        const chatGPT = require('./lib/chatgpt');
                        await chatGPT(m, iky, m.text, id);
                        return;
                    }
                    const askMedia = require('./lib/chatgpt2');
                    await askMedia(m, iky, m.text, usersCollection);
                    return;
                }
            } catch (err) {
                console.log(err);
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
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    child();
                } else {
                    console.log('connection logged out...');
                }
            }
            if (connection === 'open') {
                console.log(chalk.black(chalk.bgWhite('Successfully connected!')));
            }
        });

        return iky;
    };
    child().catch((err) => console.log(err));

}

startServer();
