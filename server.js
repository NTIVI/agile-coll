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

app.use(express.static(path.join(__dirname, 'public')));

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

// Состояние комнат: roomId -> { hostId, clients: Map(socketId -> {ws, user}) }
const rooms = {}; 

wss.on('connection', (ws) => {
    ws.id = crypto.randomUUID();
    
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
        }
    });

    ws.on('close', () => handleLeave(ws));
});

function handleJoin(ws, data) {
    const { roomId, initData, user } = data;
    
    // Если зашли из обычного браузера (нет initData), то пропускаем валидацию.
    // Если зашли из Telegram (initData есть), то проводим проверку подписи.
    const bypassValidation = !initData; 
    
    if (!bypassValidation && !validateInitData(initData)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Ошибка авторизации Telegram. Неверный токен или подпись.' }));
        return;
    }

    ws.roomId = roomId;
    ws.user = user || { id: ws.id, first_name: 'Аноним' };

    if (!rooms[roomId]) {
        rooms[roomId] = { hostId: ws.id, clients: new Map() };
    }

    const room = rooms[roomId];
    room.clients.set(ws.id, ws);
    
    // Тот, кто первый, тот и хост (админ)
    const isHost = (room.hostId === ws.id);

    // Собираем список текущих участников для нового пользователя
    const peers = [];
    room.clients.forEach((client, clientId) => {
        if (clientId !== ws.id) {
            peers.push({ id: clientId, user: client.user });
            // Уведомляем старых участников о новом подключении
            client.send(JSON.stringify({
                type: 'user-joined',
                peerId: ws.id,
                user: ws.user
            }));
        }
    });
    // Отправляем успешный ответ новому участнику
    ws.send(JSON.stringify({
        type: 'joined',
        peers: peers,
        isHost: isHost,
        yourId: ws.id
    }));
}

function handleSignaling(ws, data) {
    const room = rooms[ws.roomId];
    if (!room) return;
    
    const targetClient = room.clients.get(data.target);
    if (targetClient) {
        data.caller = ws.id; // Передаем ID отправителя
        targetClient.send(JSON.stringify(data));
    }
}

function handleAdminAction(ws, data) {
    const room = rooms[ws.roomId];
    // Проверка прав: действие может выполнить только создатель комнаты или пользователь AgileBusiness
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
    
    room.clients.delete(ws.id);
    
    // Уведомляем остальных об отключении
    room.clients.forEach((client) => {
        client.send(JSON.stringify({ type: 'user-left', peerId: ws.id }));
    });

    // Если хост вышел, назначаем нового хоста (следующего по списку) или удаляем комнату
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
}

function handleBroadcast(ws, data) {
    const room = rooms[ws.roomId];
    if (!room) return;
    
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
