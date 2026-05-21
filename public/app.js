const tg = window.Telegram.WebApp;
tg.expand(); // Расширяем аппку на весь экран телефона

// Основные переменные
let localStream;
let displayStream;
let peerConnections = {}; // id -> { pc, user }
let ws;
let currentRoomId = null;
let isHost = false;
let myUser = tg.initDataUnsafe?.user || { id: Math.floor(Math.random() * 10000), first_name: 'Пользователь ТГ' };

const ui = {
    lobby: document.getElementById('lobby-screen'),
    call: document.getElementById('call-screen'),
    adminPanel: document.getElementById('admin-panel'),
    videoGrid: document.getElementById('video-grid'),
    participantsList: document.getElementById('participants-list'),
    localPreview: document.getElementById('local-preview'),
    tgFirstName: document.getElementById('tg-first-name'),
    roomInput: document.getElementById('room-input'),
    currentRoomText: document.getElementById('current-room-id'),
    btnAdmin: document.getElementById('btn-admin-panel')
};

// Приветствие пользователя
ui.tgFirstName.textContent = myUser.first_name;

// STUN сервера Google для обхода NAT
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// 1. Инициализация локальных медиа (камера, микрофон)
async function initLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        ui.localPreview.srcObject = localStream;
        updateMediaButtons();
    } catch (e) {
        console.error('Ошибка доступа к медиа:', e);
        tg.showAlert('Разрешите доступ к камере и микрофону');
    }
}

// Управление включением/выключением аудио и видео
let isAudioEnabled = true;
let isVideoEnabled = true;

function toggleAudio() {
    if (!localStream) return;
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks()[0].enabled = isAudioEnabled;
    updateMediaButtons();
}

function toggleVideo() {
    if (!localStream) return;
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    updateMediaButtons();
}

function updateMediaButtons() {
    const audioBtnCall = document.getElementById('btn-call-mic');
    const audioBtnPrev = document.getElementById('btn-preview-mic');
    const videoBtnCall = document.getElementById('btn-call-cam');
    const videoBtnPrev = document.getElementById('btn-preview-cam');
    
    // Микрофон
    if (isAudioEnabled) {
        audioBtnPrev.textContent = '🎤';
        audioBtnPrev.className = 'bg-white/95 backdrop-blur-md text-slate-800 p-3 rounded-full hover:bg-slate-50 transition border border-slate-200/60 shadow-lg w-12 h-12 flex items-center justify-center text-lg';
        audioBtnCall.textContent = '🎤';
        audioBtnCall.className = 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100/80 p-4 rounded-full transition flex items-center justify-center w-14 h-14 text-xl shadow-sm focus:outline-none';
    } else {
        audioBtnPrev.textContent = '🔇';
        audioBtnPrev.className = 'bg-rose-50 text-rose-600 p-3 rounded-full hover:bg-rose-100 transition border border-rose-200/60 shadow-lg w-12 h-12 flex items-center justify-center text-lg';
        audioBtnCall.textContent = '🔇';
        audioBtnCall.className = 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100/80 p-4 rounded-full transition flex items-center justify-center w-14 h-14 text-xl shadow-sm focus:outline-none';
    }

    // Камера
    if (isVideoEnabled) {
        videoBtnPrev.textContent = '📷';
        videoBtnPrev.className = 'bg-white/95 backdrop-blur-md text-slate-800 p-3 rounded-full hover:bg-slate-50 transition border border-slate-200/60 shadow-lg w-12 h-12 flex items-center justify-center text-lg';
        videoBtnCall.textContent = '📷';
        videoBtnCall.className = 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100/80 p-4 rounded-full transition flex items-center justify-center w-14 h-14 text-xl shadow-sm focus:outline-none';
    } else {
        videoBtnPrev.textContent = '🚫';
        videoBtnPrev.className = 'bg-rose-50 text-rose-600 p-3 rounded-full hover:bg-rose-100 transition border border-rose-200/60 shadow-lg w-12 h-12 flex items-center justify-center text-lg';
        videoBtnCall.textContent = '🚫';
        videoBtnCall.className = 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100/80 p-4 rounded-full transition flex items-center justify-center w-14 h-14 text-xl shadow-sm focus:outline-none';
    }
}

document.getElementById('btn-preview-mic').onclick = toggleAudio;
document.getElementById('btn-call-mic').onclick = toggleAudio;
document.getElementById('btn-preview-cam').onclick = toggleVideo;
document.getElementById('btn-call-cam').onclick = toggleVideo;

// 2. Вход и Создание комнат
document.getElementById('btn-create').onclick = () => {
    // Генерация случайного ID комнаты
    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    startCall(roomId);
};

document.getElementById('btn-join').onclick = () => {
    const roomId = ui.roomInput.value.trim().toUpperCase();
    if (roomId) startCall(roomId);
};

function startCall(roomId) {
    currentRoomId = roomId;
    ui.currentRoomText.textContent = roomId;
    
    ui.lobby.classList.add('hidden');
    ui.call.classList.remove('hidden');
    ui.call.classList.add('flex'); // Восстанавливаем flex layout
    
    addLocalVideoToGrid();
    connectWebSocket();
}

function addLocalVideoToGrid() {
    ui.videoGrid.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = 'local-video-container';
    
    const video = document.createElement('video');
    video.srcObject = localStream;
    video.autoplay = true;
    video.muted = true; // Свой звук всегда замьючен
    video.playsInline = true;
    video.className = 'mirrored';
    
    const nameLabel = document.createElement('div');
    nameLabel.className = 'absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 shadow-sm border border-slate-200/50 z-10';
    nameLabel.textContent = myUser.first_name + ' (Вы)';

    container.appendChild(video);
    container.appendChild(nameLabel);
    ui.videoGrid.appendChild(container);
}

// 3. Сигналинг (Подключение к серверу)
function connectWebSocket() {
    // Подключаемся к бэкенду на Render
    ws = new WebSocket(`wss://agile-coll.onrender.com`);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            roomId: currentRoomId,
            initData: tg.initData, // Отправляем подпись для бэкенда
            user: myUser
        }));
    };
    
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'joined':
                isHost = data.isHost;
                if (isHost) ui.btnAdmin.classList.remove('hidden');
                
                // Звоним всем, кто уже в комнате
                data.peers.forEach(peer => createPeerConnection(peer.id, peer.user, true));
                updateAdminPanel();
                break;
                
            case 'user-joined':
                // Кто-то зашел, ждем от него звонка (offer)
                createPeerConnection(data.peerId, data.user, false);
                updateAdminPanel();
                break;
                
            case 'offer':
                await handleOffer(data);
                break;
                
            case 'answer':
                if (peerConnections[data.caller]) {
                    await peerConnections[data.caller].pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
                break;
                
            case 'ice-candidate':
                if (peerConnections[data.caller]) {
                    await peerConnections[data.caller].pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;
                
            case 'user-left':
                removePeer(data.peerId);
                break;
                
            case 'host-assigned':
                isHost = true;
                ui.btnAdmin.classList.remove('hidden');
                updateAdminPanel();
                break;
                
            case 'admin-action':
                handleAdminAction(data.action);
                break;
                
            case 'kicked':
                tg.showAlert('Вы были удалены из конференции', () => leaveCall());
                if (!tg.isExpanded) leaveCall(); // Фолбек для браузера
                break;
                
            case 'error':
                alert(data.message);
                leaveCall();
                break;
        }
    };
}

// 4. Логика WebRTC (Установка P2P соединения)
function createPeerConnection(peerId, user, isCaller) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = { pc, user };
    
    // Передаем свой медиапоток собеседнику
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'ice-candidate', target: peerId, candidate: event.candidate }));
        }
    };
    
    pc.ontrack = (event) => {
        // Отрисовка видео собеседника (избегаем дубликатов для аудио+видео треков)
        if (!document.getElementById(`video-${peerId}`)) {
            addRemoteVideo(peerId, event.streams[0], user);
        }
    };
    
    if (isCaller) {
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
            ws.send(JSON.stringify({ type: 'offer', target: peerId, sdp: pc.localDescription }));
        });
    }
}

async function handleOffer(data) {
    let peer = peerConnections[data.caller];
    if (!peer) { // Если offer пришел чуть раньше user-joined
        createPeerConnection(data.caller, data.user || {first_name: 'Участник'}, false);
        peer = peerConnections[data.caller];
    }
    
    const pc = peer.pc;
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    ws.send(JSON.stringify({ type: 'answer', target: data.caller, sdp: pc.localDescription }));
}

function addRemoteVideo(peerId, stream, user) {
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = `video-container-${peerId}`;
    
    const video = document.createElement('video');
    video.id = `video-${peerId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    const nameLabel = document.createElement('div');
    nameLabel.className = 'absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 shadow-sm border border-slate-200/50 z-10';
    nameLabel.textContent = user?.first_name || 'Участник';

    container.appendChild(video);
    container.appendChild(nameLabel);
    ui.videoGrid.appendChild(container);
}

function removePeer(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].pc.close();
        delete peerConnections[peerId];
        const videoEl = document.getElementById(`video-container-${peerId}`);
        if (videoEl) videoEl.remove();
        updateAdminPanel();
    }
}

// 5. Демонстрация экрана (только для ПК и поддерживаемых устройств)
document.getElementById('btn-call-share').onclick = async () => {
    try {
        if (displayStream) return stopScreenShare();
        
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        
        // Подменяем трек камеры на трек экрана у всех пиров
        for (let peerId in peerConnections) {
            const sender = peerConnections[peerId].pc.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        }
        
        // Показываем свой экран себе же
        const localVideo = document.querySelector('#local-video-container video');
        if (localVideo) {
            localVideo.srcObject = displayStream;
            localVideo.classList.remove('mirrored');
        }
        
        document.getElementById('btn-call-share').classList.remove('bg-slate-50', 'text-slate-700', 'border-slate-200');
        document.getElementById('btn-call-share').classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
        
        // Если пользователь остановил шаринг через системное меню браузера
        screenTrack.onended = () => stopScreenShare();
        
    } catch (e) {
        tg.showAlert('Демонстрация экрана не поддерживается или отменена');
    }
};

function stopScreenShare() {
    if (!displayStream) return;
    displayStream.getTracks().forEach(t => t.stop());
    displayStream = null;
    
    const cameraTrack = localStream.getVideoTracks()[0];
    
    // Возвращаем камеру всем собеседникам
    for (let peerId in peerConnections) {
        const sender = peerConnections[peerId].pc.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(cameraTrack);
    }
    
    // Возвращаем камеру себе
    const localVideo = document.querySelector('#local-video-container video');
    if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.classList.add('mirrored');
    }
    document.getElementById('btn-call-share').classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
    document.getElementById('btn-call-share').classList.add('bg-slate-50', 'text-slate-700', 'border-slate-200');
}

// 6. Панель Модерации и Права
ui.btnAdmin.onclick = () => ui.adminPanel.classList.remove('hidden');
document.getElementById('btn-close-admin').onclick = () => ui.adminPanel.classList.add('hidden');

function updateAdminPanel() {
    ui.participantsList.innerHTML = '';
    
    const count = Object.keys(peerConnections).length;
    if (count === 0) {
        ui.participantsList.innerHTML = '<div class="text-slate-400 text-center py-6 text-sm font-medium">В комнате больше никого нет</div>';
        return;
    }

    for (let peerId in peerConnections) {
        const user = peerConnections[peerId].user;
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center bg-slate-50 border border-slate-100 p-3.5 rounded-2xl';
        
        let buttons = '';
        if (isHost) {
            buttons = `
                <div class="flex gap-2">
                    <button onclick="sendAdminCmd('mute_audio', '${peerId}')" class="bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-100 hover:text-rose-600 p-2.5 rounded-xl transition shadow-sm text-slate-600" title="Выключить микрофон">🔇</button>
                    <button onclick="sendAdminCmd('mute_video', '${peerId}')" class="bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-100 hover:text-rose-600 p-2.5 rounded-xl transition shadow-sm text-slate-600" title="Выключить камеру">🚫</button>
                    <button onclick="sendAdminCmd('kick', '${peerId}')" class="bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-100 hover:text-rose-600 p-2.5 rounded-xl transition shadow-sm text-slate-600" title="Исключить">❌</button>
                </div>
            `;
        }
        
        item.innerHTML = `
            <span class="font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-[180px]">${user.first_name}</span>
            ${buttons}
        `;
        ui.participantsList.appendChild(item);
    }
}

// Глобальная функция для кнопок в HTML (из updateAdminPanel)
window.sendAdminCmd = function(action, targetId) {
    if (ws && isHost) ws.send(JSON.stringify({ type: action, target: targetId }));
}

function handleAdminAction(action) {
    if (action === 'mute_audio') {
        if (isAudioEnabled) toggleAudio();
        tg.showAlert('Организатор отключил вам микрофон');
    } else if (action === 'mute_video') {
        if (isVideoEnabled) toggleVideo();
        tg.showAlert('Организатор отключил вам камеру');
    }
}

// 7. Завершение звонка
document.getElementById('btn-leave').onclick = leaveCall;

function leaveCall() {
    if (displayStream) stopScreenShare();
    
    // Закрываем все WebRTC соединения
    for (let peerId in peerConnections) {
        peerConnections[peerId].pc.close();
    }
    peerConnections = {};
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    // Сбрасываем UI
    ui.call.classList.add('hidden');
    ui.call.classList.remove('flex');
    ui.lobby.classList.remove('hidden');
    ui.adminPanel.classList.add('hidden');
    
    isHost = false;
    ui.btnAdmin.classList.add('hidden');
    ui.videoGrid.innerHTML = '';
    
    // Возвращаем поток в окно предпросмотра
    ui.localPreview.srcObject = localStream;
}

// Запуск при загрузке страницы
initLocalMedia();
