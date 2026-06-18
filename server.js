const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Токен твоего бота для валидации Telegram Web App
const BOT_TOKEN = '8618902193:AAEeLS1Px-ckZFG66y5Jz5eUVPV54ySGN5I';

// Инициализация Telegram-бота
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Ловим ошибки поллинга, чтобы сервер не крашился при дисконнектах
bot.on('polling_error', (error) => console.log('Telegram Bot Polling Error:', error.message));

// Установка кнопки меню (в левом нижнем углу чата) для открытия Web App прямо внутри Telegram
bot.setChatMenuButton({
    menu_button: {
        type: 'web_app',
        text: 'Agile Call',
        web_app: { url: 'https://agile-coll.vercel.app/' }
    }
}).catch((err) => console.error('Ошибка установки кнопки меню:', err));

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'друг';
    
    // Также устанавливаем кнопку меню индивидуально для чата, чтобы гарантировать отображение
    bot.setChatMenuButton({
        chat_id: chatId,
        menu_button: {
            type: 'web_app',
            text: 'Agile Call',
            web_app: { url: 'https://agile-coll.vercel.app/' }
        }
    }).catch((err) => console.error('Ошибка установки индивидуальной кнопки меню:', err));
    
    bot.sendMessage(chatId, `Привет, ${name}!\n\nДобро пожаловать в Agile Call — профессиональные видеоконференции прямо внутри Telegram.\n\nСоздавайте комнаты, транслируйте экран и общайтесь с качественным звуком и видео!\n\n---\n*Данный проект был создан [Agile Business](https://agile-business-pro.com/)*`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Открыть Agile Call',
                        web_app: { url: 'https://agile-coll.vercel.app/' }
                    }
                ]
            ]
        }
    }).catch(err => {
        console.error('Ошибка отправки сообщения ботом:', err);
    });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Persistent File Storage (In-memory DB backed by local JSON files)
const fs = require('fs');
const USERS_FILE = path.join(__dirname, 'users.json');
const SERVERS_FILE = path.join(__dirname, 'servers.json');

function readJSON(file, defaultData) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(defaultData, null, 2), 'utf8');
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error('Error reading file:', file, e);
        return defaultData;
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing file:', file, e);
    }
}

let usersDB = readJSON(USERS_FILE, []);
let serversDB = readJSON(SERVERS_FILE, [
    { code: 'AGILE_CALL', name: 'Agile Call Server', ownerId: 'system', password: '' },
    { code: 'ANGEL_CALL', name: 'Angel Call Server', ownerId: 'system', password: 'angel' }
]);

// Helper to check admin
function isAdmin(userId) {
    if (!userId) return false;
    const user = usersDB.find(u => u.id.toString() === userId.toString());
    return user && user.role === 'админ';
}

// 1. API: Register User
app.post('/api/register', (req, res) => {
    const { username, email, password, avatarColor } = req.body;
    if (!username || !email || !password) {
        return res.json({ success: false, message: 'Все поля обязательны' });
    }
    
    const lowerEmail = email.toLowerCase().trim();
    let user = usersDB.find(u => u.email.toLowerCase().trim() === lowerEmail);
    
    if (user) {
        // Auto-login Telegram webhook requests
        if (email.startsWith('tg_')) {
            return res.json({ success: true, user });
        }
        return res.json({ success: false, message: 'Этот email уже зарегистрирован' });
    }
    
    // Default hidden role "пользователь"
    let role = 'пользователь';
    if (lowerEmail === 'admin@agile.com' || username.toLowerCase() === 'admin') {
        role = 'админ';
    }
    
    user = {
        id: crypto.randomUUID(),
        first_name: username,
        email: lowerEmail,
        password: password,
        avatarColor: avatarColor || '#5865F2',
        role: role
    };
    
    usersDB.push(user);
    writeJSON(USERS_FILE, usersDB);
    res.json({ success: true, user });
});

// 2. API: Login User
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.json({ success: false, message: 'Все поля обязательны' });
    }
    
    const lowerEmail = email.toLowerCase().trim();
    const user = usersDB.find(u => u.email.toLowerCase().trim() === lowerEmail && u.password === password);
    
    if (!user) {
        return res.json({ success: false, message: 'Неверный email или пароль' });
    }
    res.json({ success: true, user });
});

// 3. API: Create Server (Limit 3 per user)
app.post('/api/create-server', (req, res) => {
    const { name, code, password, userId } = req.body;
    if (!name || !code || !userId) {
        return res.json({ success: false, message: 'Заполните обязательные поля' });
    }
    
    // Check 3 servers limit
    const userServers = serversDB.filter(s => s.ownerId.toString() === userId.toString());
    if (userServers.length >= 3) {
        return res.json({ success: false, message: 'Вы не можете создать более 3 серверов.' });
    }
    
    const serverCode = code.toUpperCase().replace(/\s+/g, '_').trim();
    
    const existing = serversDB.find(s => s.code === serverCode);
    if (existing) {
        return res.json({ success: false, message: 'Сервер с таким кодом уже существует' });
    }
    
    const newServer = {
        code: serverCode,
        name: name,
        ownerId: userId,
        password: password || ''
    };
    
    serversDB.push(newServer);
    writeJSON(SERVERS_FILE, serversDB);
    res.json({ success: true, server: newServer });
});

// 4. API: Join Server (Password support)
app.post('/api/join-server', (req, res) => {
    const { code, password } = req.body;
    if (!code) {
        return res.json({ success: false, message: 'Код сервера обязателен' });
    }
    
    const serverCode = code.toUpperCase().replace(/\s+/g, '_').trim();
    const server = serversDB.find(s => s.code === serverCode);
    
    if (!server) {
        return res.json({ success: false, message: 'Сервер не найден' });
    }
    
    if (server.password && server.password !== password) {
        return res.json({ success: false, requiresPassword: true, message: 'Неверный пароль' });
    }
    
    res.json({ success: true, server });
});

// 5. API: Admin panel stats
app.get('/api/admin/data', (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId || !isAdmin(userId)) {
        return res.status(403).json({ success: false, message: 'Доступ запрещен' });
    }
    res.json({ success: true, users: usersDB, servers: serversDB });
});

// 6. API: Admin operations
app.post('/api/admin/action', (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId || !isAdmin(userId)) {
        return res.status(403).json({ success: false, message: 'Доступ запрещен' });
    }
    
    const { action, targetId, value } = req.body;
    
    if (action === 'delete-user') {
        const idx = usersDB.findIndex(u => u.id.toString() === targetId.toString());
        if (idx !== -1) {
            if (usersDB[idx].id.toString() === userId.toString()) {
                return res.json({ success: false, message: 'Нельзя удалить себя' });
            }
            usersDB.splice(idx, 1);
            writeJSON(USERS_FILE, usersDB);
            return res.json({ success: true });
        }
    } else if (action === 'change-role') {
        const user = usersDB.find(u => u.id.toString() === targetId.toString());
        if (user) {
            if (user.id.toString() === userId.toString()) {
                return res.json({ success: false, message: 'Нельзя сменить роль самому себе' });
            }
            user.role = user.role === 'админ' ? 'пользователь' : 'админ';
            writeJSON(USERS_FILE, usersDB);
            return res.json({ success: true });
        }
    } else if (action === 'change-username') {
        const user = usersDB.find(u => u.id.toString() === targetId.toString());
        if (user && value) {
            user.first_name = value;
            writeJSON(USERS_FILE, usersDB);
            return res.json({ success: true });
        }
    } else if (action === 'delete-server') {
        const idx = serversDB.findIndex(s => s.code === targetId);
        if (idx !== -1) {
            if (serversDB[idx].code === 'AGILE_CALL') {
                return res.json({ success: false, message: 'Нельзя удалить основной сервер' });
            }
            serversDB.splice(idx, 1);
            writeJSON(SERVERS_FILE, serversDB);
            return res.json({ success: true });
        }
    } else if (action === 'change-server-password') {
        const server = serversDB.find(s => s.code === targetId);
        if (server) {
            server.password = value || '';
            writeJSON(SERVERS_FILE, serversDB);
            return res.json({ success: true });
        }
    }
    
    res.json({ success: false, message: 'Неизвестное действие' });
});

// Функция валидации данных от Telegram Web App (защита комнат)
function validateInitData(telegramInitData) {
    try {
        if (!telegramInitData) return false;
        
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash');
        initData.delete('hash');
        
        const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        return hash === expectedHash;
    } catch (e) {
        console.error('Ошибка валидации:', e);
        return false;
    }
}

// Вспомогательные функции для поддержки каналов Agile Call
function getServerCode(roomId) {
    if (!roomId) return null;
    const idx = roomId.indexOf('_');
    return idx === -1 ? roomId : roomId.substring(0, idx);
}

function broadcastChannelStates(serverCode) {
    if (!serverCode) return;
    
    const channelUsers = {};
    const matchingRoomIds = [];
    
    for (const rId in rooms) {
        if (getServerCode(rId) === serverCode) {
            matchingRoomIds.push(rId);
            const idx = rId.indexOf('_');
            const channelName = idx === -1 ? 'lobby' : rId.substring(idx + 1);
            
            // Исключаем пользователей лобби из списков голосовых каналов
            if (channelName === 'lobby') continue;
            
            if (!channelUsers[channelName]) {
                channelUsers[channelName] = [];
            }
            
            rooms[rId].clients.forEach((client) => {
                channelUsers[channelName].push({
                    id: client.id,
                    user: client.user,
                    mediaState: client.mediaState || { audio: true, video: true }
                });
            });
        }
    }
    
    // Отправляем информацию обо всех каналах всем пользователям этого сервера
    matchingRoomIds.forEach((rId) => {
        const room = rooms[rId];
        if (room && room.clients) {
            room.clients.forEach((client) => {
                try {
                    client.send(JSON.stringify({
                        type: 'channel-states',
                        serverCode: serverCode,
                        channels: channelUsers
                    }));
                } catch (err) {
                    console.error('Ошибка отправки channel-states:', err);
                }
            });
        }
    });
}

// Состояние комнат: roomId -> { hostId, originalHostId, clients: Map(socketId -> {ws, user}) }
const rooms = {}; 

wss.on('connection', (ws) => {
    ws.id = crypto.randomUUID();
    ws.mediaState = { audio: true, video: true }; // Начальное состояние медиа
    
    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        switch (data.type) {
            case 'join':
                handleJoin(ws, data);
                break;
            case 'offer':
            case 'answer':
            case 'ice-candidate':
                handleSignaling(ws, data);
                break;
            case 'mute_audio':
            case 'mute_video':
            case 'kick':
                handleAdminAction(ws, data);
                break;
            case 'media-state':
            case 'speech-text':
            case 'remote-control':
                handleBroadcast(ws, data);
                break;
            case 'start-breakout':
                handleStartBreakout(ws, data);
                break;
        }
    });

    ws.on('close', () => handleLeave(ws));
});

function handleJoin(ws, data) {
    const { roomId, initData, user } = data;
    
    const bypassValidation = !initData; 
    
    if (!bypassValidation && !validateInitData(initData)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Ошибка авторизации Telegram. Неверный токен или подпись.' }));
        return;
    }

    if (ws.roomId && rooms[ws.roomId]) {
        handleLeave(ws);
    }

    ws.roomId = roomId;
    ws.user = user || { id: ws.id, first_name: 'Аноним' };
    ws.mediaState = { audio: true, video: true }; // Сбрасываем при входе

    if (!rooms[roomId]) {
        rooms[roomId] = { hostId: ws.id, originalHostId: ws.id, clients: new Map() };
    }

    const room = rooms[roomId];
    room.clients.set(ws.id, ws);
    
    if (room.originalHostId === ws.id && room.hostId !== ws.id) {
        const tempHostId = room.hostId;
        room.hostId = ws.id;
        const tempHost = room.clients.get(tempHostId);
        if (tempHost) {
            tempHost.send(JSON.stringify({ type: 'host-revoked' }));
        }
    }
    
    const isHost = (room.hostId === ws.id);

    const peers = [];
    room.clients.forEach((client, clientId) => {
        if (clientId !== ws.id) {
            peers.push({ id: clientId, user: client.user });
            client.send(JSON.stringify({
                type: 'user-joined',
                peerId: ws.id,
                user: ws.user
            }));
        }
    });
    
    ws.send(JSON.stringify({
        type: 'joined',
        peers: peers,
        isHost: isHost,
        yourId: ws.id
    }));

    // Оповещаем о статусе каналов на сервере
    broadcastChannelStates(getServerCode(roomId));
}

function handleStartBreakout(ws, data) {
    const room = rooms[ws.roomId];
    const isAllowed = room && (room.hostId === ws.id || (ws.user && ws.user.first_name === 'AgileBusiness'));
    if (!isAllowed) return;

    const { breakoutRoomId, targets } = data;
    if (!breakoutRoomId || !targets || !Array.isArray(targets)) return;

    targets.forEach(targetId => {
        const client = room.clients.get(targetId);
        if (client) {
            client.send(JSON.stringify({
                type: 'move-to-breakout',
                breakoutRoomId: breakoutRoomId
            }));
        }
    });

    ws.send(JSON.stringify({
        type: 'move-to-breakout',
        breakoutRoomId: breakoutRoomId
    }));
}

function handleSignaling(ws, data) {
    const room = rooms[ws.roomId];
    if (!room) return;
    
    const targetClient = room.clients.get(data.target);
    if (targetClient) {
        data.caller = ws.id; 
        targetClient.send(JSON.stringify(data));
    }
}

function handleAdminAction(ws, data) {
    const room = rooms[ws.roomId];
    const isAllowed = room && (room.hostId === ws.id || (ws.user && ws.user.first_name === 'AgileBusiness'));
    if (!isAllowed) return; 

    const targetClient = room.clients.get(data.target);
    if (targetClient) {
        if (data.type === 'kick') {
            targetClient.send(JSON.stringify({ type: 'kicked' }));
            targetClient.close();
            handleLeave(targetClient);
        } else {
            targetClient.send(JSON.stringify({ type: 'admin-action', action: data.type }));
        }
    }
}

function handleLeave(ws) {
    if (!ws.roomId || !rooms[ws.roomId]) return;
    const room = rooms[ws.roomId];
    const oldRoomId = ws.roomId;
    
    room.clients.delete(ws.id);
    
    room.clients.forEach((client) => {
        client.send(JSON.stringify({ type: 'user-left', peerId: ws.id }));
    });

    if (room.hostId === ws.id) {
        if (room.clients.size > 0) {
            const nextHostId = room.clients.keys().next().value;
            room.hostId = nextHostId;
            const nextHost = room.clients.get(nextHostId);
            nextHost.send(JSON.stringify({ type: 'host-assigned' })); 
        } else {
            delete rooms[ws.roomId];
        }
    }

    // Оповещаем об изменении каналов
    broadcastChannelStates(getServerCode(oldRoomId));
}

function handleBroadcast(ws, data) {
    const room = rooms[ws.roomId];
    if (!room) return;
    
    if (data.type === 'media-state') {
        ws.mediaState = {
            audio: data.audio,
            video: data.video
        };
        broadcastChannelStates(getServerCode(ws.roomId));
    }
    
    room.clients.forEach((client, clientId) => {
        if (clientId !== ws.id) {
            data.sender = ws.id;
            data.senderName = ws.user.first_name;
            client.send(JSON.stringify(data));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
