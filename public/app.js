const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
}

function showAlert(message) {
    if (tg && tg.showAlert) {
        tg.showAlert(message);
    } else {
        alert(message);
    }
}

// WebRTC STUN Servers
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const SVGS = {
    micOn: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`,
    micOff: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><path d="M17 11a7 7 0 0 1-14 0v-1M19 10v1a7.14 7.14 0 0 1-.5 2.5"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`,
    camOn: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
    camOff: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34M10.59 10.59a4 4 0 1 0 5.66 5.66"></path></svg>`
};

// Global variables
let localStream;
let displayStream;
let peerConnections = {}; // id -> { pc, user, audio: true, video: true }
let ws;
let currentRoomId = null;
let isHost = false;
let myUser = { id: Math.floor(Math.random() * 100000), first_name: 'Пользователь' };

let isAudioEnabled = true;
let isVideoEnabled = true;
let recognition; // Web Speech API
let myRemoteId = Math.floor(100000 + Math.random() * 900000).toString();
let controlledPartnerId = null;
let myClientId = null;
let activeDisplayMode = 'grid'; // 'grid' | 'speaker' | 'carousel'
let carouselIndex = 0;

const ui = {
    entryAnimation: document.getElementById('entry-animation'),
    usernameContainer: document.getElementById('username-container'),
    usernameInput: document.getElementById('username-input'),
    localPreview: document.getElementById('local-preview'),
    roomInput: document.getElementById('room-input'),
    btnCreate: document.getElementById('btn-create'),
    btnJoin: document.getElementById('btn-join'),
    
    // Call UI
    callScreen: document.getElementById('call-screen'),
    currentRoomIdText: document.getElementById('current-room-id'),
    btnCopyLink: document.getElementById('btn-copy-link'),
    btnAdminPanel: document.getElementById('btn-admin-panel'),
    btnToggleChat: document.getElementById('btn-toggle-chat'),
    videoGrid: document.getElementById('video-grid'),
    
    // Chat Drawer UI
    chatDrawer: document.getElementById('chat-drawer'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    btnSendChat: document.getElementById('btn-send-chat'),
    speechDot: document.getElementById('speech-dot'),
    speechStatusText: document.getElementById('speech-status-text'),
    
    // Bottom Controls UI
    btnCallMic: document.getElementById('btn-call-mic'),
    btnCallCam: document.getElementById('btn-call-cam'),
    btnCallShare: document.getElementById('btn-call-share'),
    btnLeave: document.getElementById('btn-leave'),
    
    // Admin Modal UI
    adminPanel: document.getElementById('admin-panel'),
    btnCloseAdmin: document.getElementById('btn-close-admin'),
    participantsList: document.getElementById('participants-list'),
    
    // Remote Control UI
    btnCallRemote: document.getElementById('btn-call-remote'),
    remotePanel: document.getElementById('remote-panel'),
    btnCloseRemote: document.getElementById('btn-close-remote'),
    myRemoteIdEl: document.getElementById('my-remote-id'),
    remotePartnerIdInput: document.getElementById('remote-partner-id'),
    btnConnectRemote: document.getElementById('btn-connect-remote'),
    remoteCursor: document.getElementById('remote-cursor')
};

// 10. Entrance Animation (2 seconds minimum)
window.addEventListener('DOMContentLoaded', () => {
    if (ui.myRemoteIdEl) ui.myRemoteIdEl.textContent = myRemoteId;
    setTimeout(() => {
        if (ui.entryAnimation) {
            ui.entryAnimation.classList.add('fade-out');
        }
    }, 2000);
    
    // Parse URL room parameters
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room') || urlParams.get('join');
    if (roomParam) {
        if (ui.roomInput) {
            ui.roomInput.value = roomParam.toUpperCase();
        }
        // Delay joining slightly to let user see intro animation and finish camera init
        setTimeout(() => {
            startCall(roomParam.toUpperCase());
        }, 2200);
    }
});

// Configure Telegram profile vs manual browser name input
if (tg.initData && tg.initDataUnsafe?.user) {
    myUser = tg.initDataUnsafe.user;
    if (ui.usernameContainer) {
        ui.usernameContainer.style.display = 'none';
    }
} else {
    const savedName = localStorage.getItem('agile_call_username');
    if (savedName) {
        myUser.first_name = savedName;
        if (ui.usernameInput) ui.usernameInput.value = savedName;
    } else {
        myUser.first_name = 'Пользователь ' + Math.floor(Math.random() * 1000);
        if (ui.usernameInput) ui.usernameInput.value = myUser.first_name;
    }
    
    if (ui.usernameInput) {
        ui.usernameInput.addEventListener('input', () => {
            const val = ui.usernameInput.value.trim();
            myUser.first_name = val || 'Пользователь';
            localStorage.setItem('agile_call_username', myUser.first_name);
        });
    }
}

// Helper to compute initials
function getInitials(name) {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

// 1. Local Media Initialization
async function initLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (ui.localPreview) {
            ui.localPreview.srcObject = localStream;
        }
        updateMediaButtons();
        initSpeechToText();
    } catch (e) {
        console.error('Ошибка доступа к медиа:', e);
        showAlert('Разрешите доступ к камере и микрофону в настройках вашего устройства');
    }
}

// Toggle media streams
function toggleAudio() {
    if (!localStream) return;
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks()[0].enabled = isAudioEnabled;
    updateMediaButtons();
    
    // Update local tile UI instantly
    const localMic = document.getElementById('local-mic-muted');
    if (localMic) {
        localMic.style.display = isAudioEnabled ? 'none' : 'flex';
    }

    // Toggle speech recognition
    if (recognition) {
        if (isAudioEnabled) {
            try { recognition.start(); } catch (err) {}
        } else {
            recognition.stop();
        }
    }

    broadcastMediaState();
}

function toggleVideo() {
    if (!localStream) return;
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    updateMediaButtons();

    // Update local tile UI instantly
    const localCam = document.getElementById('local-cam-placeholder');
    if (localCam) {
        localCam.style.display = isVideoEnabled ? 'none' : 'flex';
    }

    broadcastMediaState();
}

function updateMediaButtons() {
    const btnPrevMic = document.getElementById('btn-preview-mic');
    const btnPrevCam = document.getElementById('btn-preview-cam');
    const btnCallMic = document.getElementById('btn-call-mic');
    const btnCallCam = document.getElementById('btn-call-cam');

    if (isAudioEnabled) {
        if (btnPrevMic) { btnPrevMic.innerHTML = SVGS.micOn; btnPrevMic.classList.remove('active-red'); }
        if (btnCallMic) { btnCallMic.innerHTML = SVGS.micOn; btnCallMic.classList.add('active-red'); }
    } else {
        if (btnPrevMic) { btnPrevMic.innerHTML = SVGS.micOff; btnPrevMic.classList.add('active-red'); }
        if (btnCallMic) { btnCallMic.innerHTML = SVGS.micOff; btnCallMic.classList.remove('active-red'); }
    }

    if (isVideoEnabled) {
        if (btnPrevCam) { btnPrevCam.innerHTML = SVGS.camOn; btnPrevCam.classList.remove('active-red'); }
        if (btnCallCam) { btnCallCam.innerHTML = SVGS.camOn; btnCallCam.classList.add('active-red'); }
    } else {
        if (btnPrevCam) { btnPrevCam.innerHTML = SVGS.camOff; btnPrevCam.classList.add('active-red'); }
        if (btnCallCam) { btnCallCam.innerHTML = SVGS.camOff; btnCallCam.classList.remove('active-red'); }
    }
}

// Bind buttons
if (document.getElementById('btn-preview-mic')) document.getElementById('btn-preview-mic').onclick = toggleAudio;
if (ui.btnCallMic) ui.btnCallMic.onclick = toggleAudio;
if (document.getElementById('btn-preview-cam')) document.getElementById('btn-preview-cam').onclick = toggleVideo;
if (ui.btnCallCam) ui.btnCallCam.onclick = toggleVideo;

// 2. Joining & Creating Rooms
if (ui.btnCreate) {
    ui.btnCreate.onclick = () => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        startCall(roomId);
    };
}

if (ui.btnJoin) {
    ui.btnJoin.onclick = () => {
        const roomId = ui.roomInput.value.trim().toUpperCase();
        if (roomId) startCall(roomId);
    };
}

function startCall(roomId) {
    currentRoomId = roomId;
    if (ui.currentRoomIdText) {
        ui.currentRoomIdText.textContent = roomId;
    }
    
    if (ui.callScreen) {
        ui.callScreen.style.display = 'flex';
    }
    
    // Clear chat list
    if (ui.chatMessages) {
        ui.chatMessages.innerHTML = '';
    }
    
    addLocalVideoToGrid();
    connectWebSocket();
    
    // Start speech recognition if mic is on
    if (recognition && isAudioEnabled) {
        try { recognition.start(); } catch (err) {}
    }
}

// 3. Grid sizing algorithm
function updateVideoGridClass() {
    const grid = ui.videoGrid;
    if (!grid) return;
    
    // Clear any previous mode classes and scroll rows
    grid.classList.remove('mode-grid', 'mode-speaker', 'mode-carousel', 'grid-1-player', 'grid-2-players', 'grid-many-players');
    
    // 1. If we have a scroll-row from a previous Speaker mode, flatten it back so all tiles are direct children of #video-grid
    const scrollRow = grid.querySelector('.speaker-scroll-row');
    if (scrollRow) {
        const children = Array.from(scrollRow.children);
        children.forEach(child => grid.appendChild(child));
        scrollRow.remove();
    }
    
    // Get all wrapper children
    const tiles = Array.from(grid.querySelectorAll('.video-wrapper'));
    const tilesCount = tiles.length;
    
    // Reset all wrappers to visible and remove focused classes
    tiles.forEach(tile => {
        tile.style.display = 'block';
        tile.classList.remove('main-focus', 'active-slide');
    });
    
    // Hide carousel controls by default
    const carouselControls = document.getElementById('carousel-controls');
    if (carouselControls) carouselControls.style.display = 'none';
    
    if (activeDisplayMode === 'speaker' && tilesCount > 1) {
        grid.classList.add('mode-speaker');
        
        // Find which tile should be in focus:
        // Priority: 1. Remote screenshare, 2. First remote video, 3. Local video
        let focusTile = tiles.find(tile => tile.id !== 'local-video-container');
        if (!focusTile) focusTile = tiles[0]; // Fallback to local
        
        if (focusTile) {
            focusTile.classList.add('main-focus');
            
            // Create horizontal scroll row for all other tiles
            const row = document.createElement('div');
            row.className = 'speaker-scroll-row';
            
            tiles.forEach(tile => {
                if (tile !== focusTile) {
                    row.appendChild(tile);
                }
            });
            grid.appendChild(row);
        }
    } else if (activeDisplayMode === 'carousel' && tilesCount > 0) {
        grid.classList.add('mode-carousel');
        
        // Clamp carouselIndex
        if (carouselIndex >= tilesCount) carouselIndex = 0;
        if (carouselIndex < 0) carouselIndex = tilesCount - 1;
        
        tiles.forEach((tile, idx) => {
            if (idx === carouselIndex) {
                tile.classList.add('active-slide');
                tile.style.display = 'block';
            } else {
                tile.style.display = 'none';
            }
        });
        
        // Show carousel controls
        if (carouselControls) {
            carouselControls.style.display = 'flex';
            
            // Render dot indicators
            const indicators = document.getElementById('carousel-indicators');
            if (indicators) {
                indicators.innerHTML = '';
                tiles.forEach((_, idx) => {
                    const dot = document.createElement('div');
                    dot.className = `carousel-dot ${idx === carouselIndex ? 'active' : ''}`;
                    dot.onclick = () => {
                        carouselIndex = idx;
                        updateVideoGridClass();
                    };
                    indicators.appendChild(dot);
                });
            }
        }
    } else {
        // Standard Grid Mode
        grid.classList.add('mode-grid');
        if (tilesCount <= 1) {
            grid.classList.add('grid-1-player');
        } else if (tilesCount === 2) {
            grid.classList.add('grid-2-players');
        } else {
            grid.classList.add('grid-many-players');
        }
    }
}

function addLocalVideoToGrid() {
    if (!ui.videoGrid) return;
    
    // Remove if already present
    const existing = document.getElementById('local-video-container');
    if (existing) existing.remove();
    
    const container = document.createElement('div');
    container.className = 'video-wrapper';
    container.id = 'local-video-container';
    
    const video = document.createElement('video');
    video.srcObject = localStream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.className = 'mirrored';
    
    // Camera off placeholder
    const camPlaceholder = document.createElement('div');
    camPlaceholder.className = 'camera-off-placeholder';
    camPlaceholder.id = 'local-cam-placeholder';
    camPlaceholder.style.display = isVideoEnabled ? 'none' : 'flex';
    camPlaceholder.innerHTML = `
        <div class="placeholder-avatar">${getInitials(myUser.first_name)}</div>
        <div class="placeholder-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.2rem;height:1.2rem;"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M7 7H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4M21 9l-4 3v-2a2 2 0 0 0-2-2H9"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Камера выключена
        </div>
    `;

    // Mic muted overlay
    const micMutedOverlay = document.createElement('div');
    micMutedOverlay.className = 'mic-muted-overlay';
    micMutedOverlay.id = 'local-mic-muted';
    micMutedOverlay.style.display = isAudioEnabled ? 'none' : 'flex';
    micMutedOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.1rem;height:1.1rem;"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1M5 10v1a7 7 0 0 0 10.8 5.9M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
    `;

    // Speech subtitle bubble
    const subtitleBubble = document.createElement('div');
    subtitleBubble.className = 'speech-subtitle-bubble';
    subtitleBubble.id = 'local-subtitle-bubble';

    const nameLabel = document.createElement('div');
    nameLabel.className = 'participant-label';
    nameLabel.textContent = myUser.first_name + ' (Вы)';

    container.appendChild(video);
    container.appendChild(camPlaceholder);
    container.appendChild(micMutedOverlay);
    container.appendChild(subtitleBubble);
    container.appendChild(nameLabel);
    
    ui.videoGrid.appendChild(container);
    updateVideoGridClass();
}

// 2. Room Link copy
if (ui.btnCopyLink) {
    ui.btnCopyLink.onclick = () => {
        const link = window.location.origin + '?room=' + currentRoomId;
        navigator.clipboard.writeText(link).then(() => {
            showAlert('Ссылка на конференцию скопирована');
        }).catch(() => {
            alert('Ссылка: ' + link);
        });
    };
}

// Toggle chat side drawer
if (ui.btnToggleChat) {
    ui.btnToggleChat.onclick = () => {
        if (ui.chatDrawer) {
            ui.chatDrawer.classList.toggle('hidden');
        }
    };
}

const btnCloseChat = document.getElementById('btn-close-chat');
if (btnCloseChat) {
    btnCloseChat.onclick = () => {
        if (ui.chatDrawer) {
            ui.chatDrawer.classList.add('hidden');
        }
    };
}

// 16. Chat Text messaging
function sendTextMessage() {
    if (!ui.chatInput) return;
    const text = ui.chatInput.value.trim();
    if (!text) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'speech-text',
            text: text
        }));
    }
    
    addChatMessage(myUser.first_name, text, true);
    ui.chatInput.value = '';
}

if (ui.btnSendChat) ui.btnSendChat.onclick = sendTextMessage;
if (ui.chatInput) {
    ui.chatInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            sendTextMessage();
        }
    };
}

function addChatMessage(senderName, text, isSelf) {
    if (!ui.chatMessages) return;
    
    const msg = document.createElement('div');
    msg.className = `msg-bubble ${isSelf ? 'self' : ''}`;
    
    const sender = document.createElement('div');
    sender.className = `msg-sender ${isSelf ? 'self' : ''}`;
    sender.textContent = isSelf ? 'Вы' : senderName;
    
    const txt = document.createElement('div');
    txt.className = 'msg-text';
    txt.textContent = text;
    
    msg.appendChild(sender);
    msg.appendChild(txt);
    ui.chatMessages.appendChild(msg);
    
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
}

// 16. Web Speech API Speech-to-Text
function initSpeechToText() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
        if (ui.speechStatusText) ui.speechStatusText.textContent = 'STT не поддерживается';
        return;
    }
    
    recognition = new Speech();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'ru-RU';
    
    recognition.onstart = () => {
        if (ui.speechDot) ui.speechDot.classList.add('listening');
        if (ui.speechStatusText) ui.speechStatusText.textContent = 'Слушаю речь';
    };
    
    recognition.onend = () => {
        if (ui.speechDot) ui.speechDot.classList.remove('listening');
        if (ui.speechStatusText) ui.speechStatusText.textContent = 'Тишина';
        
        // Auto restart if mic remains active and call continues
        if (currentRoomId && isAudioEnabled) {
            try { recognition.start(); } catch (err) {}
        }
    };
    
    recognition.onresult = (event) => {
        const index = event.resultIndex;
        const transcript = event.results[index][0].transcript.trim();
        if (transcript) {
            sendSpeechTranscript(transcript);
        }
    };
}

function sendSpeechTranscript(transcript) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'speech-text',
            text: transcript
        }));
    }
    
    addChatMessage(myUser.first_name, transcript, true);
    displaySubtitle('local', transcript);
}

function displaySubtitle(peerId, text) {
    const bubbleId = peerId === 'local' ? 'local-subtitle-bubble' : `subtitle-bubble-${peerId}`;
    const bubble = document.getElementById(bubbleId);
    if (bubble) {
        bubble.textContent = text;
        bubble.classList.add('active');
        
        if (bubble.timeoutId) clearTimeout(bubble.timeoutId);
        
        bubble.timeoutId = setTimeout(() => {
            bubble.classList.remove('active');
        }, 3500);
    }
}

// Sync mic and cam states over WebSocket
function broadcastMediaState() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'media-state',
            audio: isAudioEnabled,
            video: isVideoEnabled
        }));
    }
}

// 3. WebSockets Signalling & State sync
function connectWebSocket() {
    // Dynamically choose secure/unsecure WS protocol based on window location
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const serverHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'localhost:3000' 
        : 'agile-coll.onrender.com';
        
    ws = new WebSocket(`${protocol}://${serverHost}`);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            roomId: currentRoomId,
            initData: tg.initData,
            user: myUser
        }));
        
        // Sync media state as soon as we connect
        setTimeout(broadcastMediaState, 500);
    };
    
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'joined':
                isHost = data.isHost;
                myClientId = data.yourId;
                if (ui.btnAdminPanel) {
                    ui.btnAdminPanel.style.display = 'block';
                }
                
                // Ring everyone in the room
                data.peers.forEach(peer => createPeerConnection(peer.id, peer.user, true));
                updateAdminPanel();
                break;
                
            case 'user-joined':
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
                if (ui.btnAdminPanel) {
                    ui.btnAdminPanel.style.display = 'block';
                }
                updateAdminPanel();
                break;
                
            case 'admin-action':
                handleAdminAction(data.action);
                break;
                
            case 'kicked':
                showAlert('Вы были удалены из конференции организатором');
                leaveCall();
                break;
                
            case 'media-state':
                // Sync remote participant mic & cam state visually
                handleRemoteMediaState(data.sender, data.audio, data.video);
                break;
                
            case 'speech-text':
                // Display remote text in chat and as tile subtitle overlay
                addChatMessage(data.senderName || 'Собеседник', data.text, false);
                displaySubtitle(data.sender, data.text);
                break;
                
            case 'remote-control':
                handleRemoteControlMessage(data);
                break;
                
            case 'error':
                alert(data.message);
                leaveCall();
                break;
        }
    };
    
    ws.onclose = () => {
        console.log('WS Connection closed');
    };
}

// 4. WebRTC Connection Setup
function createPeerConnection(peerId, user, isCaller) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = { pc, user, audio: true, video: true };
    
    // Add local media tracks to peer connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'ice-candidate', target: peerId, candidate: event.candidate }));
        }
    };
    
    pc.ontrack = (event) => {
        if (!document.getElementById(`video-${peerId}`)) {
            addRemoteVideo(peerId, event.streams[0], user);
        }
    };
    
    if (isCaller) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                ws.send(JSON.stringify({ type: 'offer', target: peerId, sdp: pc.localDescription }));
            });
    }
}

async function handleOffer(data) {
    let peer = peerConnections[data.caller];
    if (!peer) {
        createPeerConnection(data.caller, data.user || { first_name: 'Участник' }, false);
        peer = peerConnections[data.caller];
    }
    
    const pc = peer.pc;
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    ws.send(JSON.stringify({ type: 'answer', target: data.caller, sdp: pc.localDescription }));
}

// Render remote participant tile
function addRemoteVideo(peerId, stream, user) {
    if (!ui.videoGrid) return;
    
    const container = document.createElement('div');
    container.className = 'video-wrapper';
    container.id = `video-container-${peerId}`;
    
    const video = document.createElement('video');
    video.id = `video-${peerId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    
    // Camera off placeholder
    const camPlaceholder = document.createElement('div');
    camPlaceholder.className = 'camera-off-placeholder';
    camPlaceholder.id = `cam-placeholder-${peerId}`;
    // Initially hide until states synced
    camPlaceholder.style.display = 'none'; 
    camPlaceholder.innerHTML = `
        <div class="placeholder-avatar">${getInitials(user?.first_name)}</div>
        <div class="placeholder-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.2rem;height:1.2rem;"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M7 7H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4M21 9l-4 3v-2a2 2 0 0 0-2-2H9"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Камера выключена
        </div>
    `;

    // Mic muted overlay
    const micMutedOverlay = document.createElement('div');
    micMutedOverlay.className = 'mic-muted-overlay';
    micMutedOverlay.id = `mic-muted-${peerId}`;
    micMutedOverlay.style.display = 'none';
    micMutedOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.1rem;height:1.1rem;"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1M5 10v1a7 7 0 0 0 10.8 5.9M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
    `;

    // Speech subtitle bubble
    const subtitleBubble = document.createElement('div');
    subtitleBubble.className = 'speech-subtitle-bubble';
    subtitleBubble.id = `subtitle-bubble-${peerId}`;

    const nameLabel = document.createElement('div');
    nameLabel.className = 'participant-label';
    nameLabel.textContent = user?.first_name || 'Участник';

    container.appendChild(video);
    container.appendChild(camPlaceholder);
    container.appendChild(micMutedOverlay);
    container.appendChild(subtitleBubble);
    container.appendChild(nameLabel);
    
    ui.videoGrid.appendChild(container);
    updateVideoGridClass();
    
    // Request state sync from this remote client
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Broadcast local media state so they know our setup
        broadcastMediaState();
    }
}

function handleRemoteMediaState(senderId, audioEnabled, videoEnabled) {
    if (peerConnections[senderId]) {
        peerConnections[senderId].audio = audioEnabled;
        peerConnections[senderId].video = videoEnabled;
    }
    
    const camPlaceholder = document.getElementById(`cam-placeholder-${senderId}`);
    if (camPlaceholder) {
        camPlaceholder.style.display = videoEnabled ? 'none' : 'flex';
    }
    
    const micMuted = document.getElementById(`mic-muted-${senderId}`);
    if (micMuted) {
        micMuted.style.display = audioEnabled ? 'none' : 'flex';
    }
}

function removePeer(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].pc.close();
        delete peerConnections[peerId];
        const tile = document.getElementById(`video-container-${peerId}`);
        if (tile) tile.remove();
        updateVideoGridClass();
        updateAdminPanel();
    }
}

// 15. Screen Sharing
if (ui.btnCallShare) {
    ui.btnCallShare.onclick = async () => {
        try {
            if (displayStream) return stopScreenShare();
            
            displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = displayStream.getVideoTracks()[0];
            
            // Swapping video track on peer connections
            for (let peerId in peerConnections) {
                const sender = peerConnections[peerId].pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            }
            
            // Swap local preview stream
            const localVideo = document.querySelector('#local-video-container video');
            if (localVideo) {
                localVideo.srcObject = displayStream;
                localVideo.classList.remove('mirrored');
            }
            
            ui.btnCallShare.classList.add('active-red');
            
            // Hide camera placeholder when screen-sharing is live
            const localPlaceholder = document.getElementById('local-cam-placeholder');
            if (localPlaceholder) localPlaceholder.style.display = 'none';
            
            screenTrack.onended = () => stopScreenShare();
        } catch (e) {
            console.error(e);
            showAlert('Трансляция экрана отменена или не поддерживается вашим устройством');
        }
    };
}

function stopScreenShare() {
    if (!displayStream) return;
    displayStream.getTracks().forEach(t => t.stop());
    displayStream = null;
    
    const cameraTrack = localStream.getVideoTracks()[0];
    
    for (let peerId in peerConnections) {
        const sender = peerConnections[peerId].pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(cameraTrack);
        }
    }
    
    const localVideo = document.querySelector('#local-video-container video');
    if (localVideo) {
        localVideo.srcObject = localStream;
        if (isVideoEnabled) localVideo.classList.add('mirrored');
    }
    
    ui.btnCallShare.classList.remove('active-red');
    
    // Restore local video placeholder if camera is disabled
    const localPlaceholder = document.getElementById('local-cam-placeholder');
    if (localPlaceholder) {
        localPlaceholder.style.display = isVideoEnabled ? 'none' : 'flex';
    }
}

// Moderator Admin dialog panel controls
if (ui.btnAdminPanel) {
    ui.btnAdminPanel.onclick = () => {
        if (ui.adminPanel) {
            ui.adminPanel.style.display = ui.adminPanel.style.display === 'flex' ? 'none' : 'flex';
        }
    };
}

if (ui.btnCloseAdmin) {
    ui.btnCloseAdmin.onclick = () => {
        if (ui.adminPanel) ui.adminPanel.style.display = 'none';
    };
}

function updateAdminPanel() {
    if (!ui.participantsList) return;
    ui.participantsList.innerHTML = '';
    
    const count = Object.keys(peerConnections).length;
    if (count === 0) {
        ui.participantsList.innerHTML = '<div style="color:var(--color-gray); text-align:center; padding:1.5rem; font-size:0.85rem; font-weight:600;">Нет активных участников</div>';
        return;
    }
    
    for (let peerId in peerConnections) {
        const user = peerConnections[peerId].user;
        const item = document.createElement('div');
        item.className = 'participant-item';
        
        let buttons = '';
        if (isHost || myUser.first_name === 'AgileBusiness') {
            buttons = `
                <div class="participant-actions">
                    <button onclick="startAdminRemoteControl('${peerId}')" class="btn-mini" title="Удаленное управление" style="background-color: var(--color-blurple); color: white;">
                        <svg style="width:0.9rem;height:0.9rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                    </button>
                    <button onclick="sendAdminCmd('mute_audio', '${peerId}')" class="btn-mini" title="Заглушить">
                        <svg style="width:0.9rem;height:0.9rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
                    </button>
                    <button onclick="sendAdminCmd('mute_video', '${peerId}')" class="btn-mini" title="Выключить камеру">
                        <svg style="width:0.9rem;height:0.9rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34M10.59 10.59a4 4 0 1 0 5.66 5.66"></path></svg>
                    </button>
                    <button onclick="sendAdminCmd('kick', '${peerId}')" class="btn-mini" title="Исключить">
                        <svg style="width:0.9rem;height:0.9rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" x2="6" y1="6" y2="18"></line><line x1="6" x2="18" y1="6" y2="18"></line></svg>
                    </button>
                </div>
            `;
        }
        
        item.innerHTML = `
            <span class="participant-name">${user.first_name}</span>
            ${buttons}
        `;
        ui.participantsList.appendChild(item);
    }
}

window.startAdminRemoteControl = function(targetId) {
    controlledPartnerId = targetId;
    
    // Automatically request the remote partner to start screen sharing
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'remote-control',
            targetRemoteId: controlledPartnerId,
            action: 'request-screenshare'
        }));
    }
    
    // Hide the admin panel modal so they can see the screen
    if (ui.adminPanel) ui.adminPanel.style.display = 'none';
    
    // Toggle active state on the remote button
    if (ui.btnCallRemote) {
        ui.btnCallRemote.classList.add('active-red');
    }
    
    showAlert('Запрошено удаленное управление пользователем. Его экран и управление транслируются.');
};

window.sendAdminCmd = function(action, targetId) {
    if (ws && (isHost || myUser.first_name === 'AgileBusiness')) {
        ws.send(JSON.stringify({ type: action, target: targetId }));
    }
};

function handleAdminAction(action) {
    if (action === 'mute_audio') {
        if (isAudioEnabled) toggleAudio();
        showAlert('Организатор конференции отключил вам микрофон');
    } else if (action === 'mute_video') {
        if (isVideoEnabled) toggleVideo();
        showAlert('Организатор конференции отключил вам камеру');
    }
}

// 7. Leaving the call
if (ui.btnLeave) ui.btnLeave.onclick = leaveCall;

function leaveCall() {
    if (displayStream) stopScreenShare();
    
    // Stop speech recognition
    if (recognition) {
        try { recognition.stop(); } catch(e) {}
    }
    
    // Close connections
    for (let peerId in peerConnections) {
        peerConnections[peerId].pc.close();
    }
    peerConnections = {};
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    // Reset call layout overlays
    if (ui.callScreen) {
        ui.callScreen.style.display = 'none';
    }
    if (ui.adminPanel) {
        ui.adminPanel.style.display = 'none';
    }
    
    isHost = false;
    if (ui.btnAdminPanel) {
        ui.btnAdminPanel.style.display = 'none';
    }
    if (ui.videoGrid) {
        ui.videoGrid.innerHTML = '';
    }
    
    // Restore stream preview
    if (ui.localPreview) {
        ui.localPreview.srcObject = localStream;
    }
}

// ===== DARK / LIGHT THEME TOGGLE =====
(function() {
    const htmlEl = document.documentElement;
    const btnLight = document.getElementById('btn-theme-light');
    const btnDark = document.getElementById('btn-theme-dark');
    const headerLogoDot = document.getElementById('header-logo-dot');
    const headerLogoBlack = document.getElementById('header-logo-black');

    function applyTheme(theme) {
        if (theme === 'dark') {
            htmlEl.setAttribute('data-theme', 'dark');
            if (headerLogoDot) headerLogoDot.setAttribute('fill', '#F0EBE3');
            if (headerLogoBlack) headerLogoBlack.setAttribute('stroke', '#F0EBE3');
            if (btnDark) btnDark.classList.add('active');
            if (btnLight) btnLight.classList.remove('active');
        } else {
            htmlEl.removeAttribute('data-theme');
            if (headerLogoDot) headerLogoDot.setAttribute('fill', '#121212');
            if (headerLogoBlack) headerLogoBlack.setAttribute('stroke', '#121212');
            if (btnLight) btnLight.classList.add('active');
            if (btnDark) btnDark.classList.remove('active');
        }
        localStorage.setItem('agile_call_theme', theme);
    }

    // Load saved theme preference
    const savedTheme = localStorage.getItem('agile_call_theme') || 'light';
    applyTheme(savedTheme);

    if (btnLight) {
        btnLight.addEventListener('click', () => applyTheme('light'));
    }
    if (btnDark) {
        btnDark.addEventListener('click', () => applyTheme('dark'));
    }
})();

// Initialize camera stream preview on startup
initLocalMedia();

// Remote Control Logic
if (ui.btnCallRemote) {
    ui.btnCallRemote.onclick = () => {
        if (ui.remotePanel) ui.remotePanel.style.display = 'flex';
    };
}
if (ui.btnCloseRemote) {
    ui.btnCloseRemote.onclick = () => {
        if (ui.remotePanel) ui.remotePanel.style.display = 'none';
    };
}
if (ui.btnConnectRemote) {
    ui.btnConnectRemote.onclick = () => {
        const targetId = ui.remotePartnerIdInput.value.trim();
        if (targetId && targetId !== myRemoteId) {
            controlledPartnerId = targetId;
            ui.btnConnectRemote.textContent = 'Подключено';
            ui.btnConnectRemote.style.backgroundColor = 'var(--color-black)';
            ui.btnCallRemote.classList.add('active-red');
            if (ui.remotePanel) ui.remotePanel.style.display = 'none';
            
            // Automatically request the remote partner to start screen sharing
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'remote-control',
                    targetRemoteId: controlledPartnerId,
                    action: 'request-screenshare'
                }));
            }
            
            // Also start local screensharing if not already doing so, to make it fully reciprocal and interactive
            if (!displayStream && ui.btnCallShare) {
                ui.btnCallShare.click();
            }

            showAlert('Вы подключились к устройству. Движения, клики мыши и клавиатура транслируются.');
        } else {
            controlledPartnerId = null;
            ui.btnConnectRemote.textContent = 'Подключиться';
            ui.btnConnectRemote.style.backgroundColor = 'var(--color-red)';
            ui.btnCallRemote.classList.remove('active-red');
        }
    };
}

// Mouse move tracking
document.addEventListener('mousemove', (e) => {
    if (controlledPartnerId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'remote-control',
            targetRemoteId: controlledPartnerId,
            action: 'mousemove',
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight
        }));
    }
});

// Click tracking with smart filters
document.addEventListener('click', (e) => {
    // Avoid sending events when interacting with call controls, headers, drawers, or remote control panels
    const isControlEl = e.target.closest('#remote-panel') || 
                        e.target.closest('.theme-switch-container') || 
                        e.target.closest('.call-controls-bar') || 
                        e.target.closest('header') || 
                        e.target.closest('.chat-drawer');
    if (isControlEl) return;
    
    if (controlledPartnerId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'remote-control',
            targetRemoteId: controlledPartnerId,
            action: 'click',
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight
        }));
    }
});

// Keyboard tracking
document.addEventListener('keydown', (e) => {
    if (controlledPartnerId && ws && ws.readyState === WebSocket.OPEN) {
        // Do not transmit keypresses if the user is typing in our own input fields (like chat message or partner ID)
        if (document.activeElement && (
            document.activeElement.id === 'remote-partner-id' || 
            document.activeElement.closest('.chat-input-area') ||
            document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA'
        )) {
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'remote-control',
            targetRemoteId: controlledPartnerId,
            action: 'keydown',
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey
        }));
    }
});

function handleRemoteControlMessage(data) {
    if (data.targetRemoteId !== myRemoteId && data.targetRemoteId !== myClientId) return;
    
    if (data.action === 'request-screenshare') {
        // Automatically activate screen sharing on the controlled host device
        if (!displayStream && ui.btnCallShare) {
            ui.btnCallShare.click();
        }
    } else if (data.action === 'mousemove') {
        if (ui.remoteCursor) {
            ui.remoteCursor.style.display = 'block';
            ui.remoteCursor.style.left = (data.x * window.innerWidth) + 'px';
            ui.remoteCursor.style.top = (data.y * window.innerHeight) + 'px';
        }
    } else if (data.action === 'click') {
        const clickX = data.x * window.innerWidth;
        const clickY = data.y * window.innerHeight;
        
        // Hide fake cursor temporarily so elementFromPoint doesn't hit it
        if (ui.remoteCursor) {
            ui.remoteCursor.style.display = 'none';
        }
        
        const el = document.elementFromPoint(clickX, clickY);
        if (el && typeof el.click === 'function') {
            el.click();
            // Focus if it's an input/textarea
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.hasAttribute('contenteditable')) {
                el.focus();
            }
        }
        
        // Restore fake cursor and show visual effect
        if (ui.remoteCursor) {
            ui.remoteCursor.style.display = 'block';
            ui.remoteCursor.style.left = clickX + 'px';
            ui.remoteCursor.style.top = clickY + 'px';
            ui.remoteCursor.style.transform = 'scale(0.7)';
            setTimeout(() => {
                ui.remoteCursor.style.transform = 'scale(1)';
            }, 150);
        }
    } else if (data.action === 'keydown') {
        const activeEl = document.activeElement || document.body;
        
        // Simulate typing if an input field is currently active/focused on the host's side
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            if (data.key.length === 1) { // Normal printable character
                const start = activeEl.selectionStart;
                const end = activeEl.selectionEnd;
                const val = activeEl.value;
                activeEl.value = val.substring(0, start) + data.key + val.substring(end);
                activeEl.selectionStart = activeEl.selectionEnd = start + 1;
                activeEl.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (data.key === 'Backspace') {
                const start = activeEl.selectionStart;
                const end = activeEl.selectionEnd;
                const val = activeEl.value;
                if (start === end && start > 0) {
                    activeEl.value = val.substring(0, start - 1) + val.substring(end);
                    activeEl.selectionStart = activeEl.selectionEnd = start - 1;
                } else if (start !== end) {
                    activeEl.value = val.substring(0, start) + val.substring(end);
                    activeEl.selectionStart = activeEl.selectionEnd = start;
                }
                activeEl.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (data.key === 'Enter') {
                activeEl.dispatchEvent(new Event('change', { bubbles: true }));
                const form = activeEl.closest('form');
                if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true }));
                } else {
                    // Try to trigger click on any nearby send/submit buttons (e.g. chat send button)
                    const sendBtn = document.querySelector('.chat-input-area button, button[type="submit"]');
                    if (sendBtn) sendBtn.click();
                }
            }
        }
        
        // Always dispatch standard KeyboardEvent
        const keyEvent = new KeyboardEvent('keydown', {
            key: data.key,
            code: data.code,
            ctrlKey: data.ctrlKey,
            shiftKey: data.shiftKey,
            altKey: data.altKey,
            metaKey: data.metaKey,
            bubbles: true,
            cancelable: true
        });
        activeEl.dispatchEvent(keyEvent);
    }
}

// ===== DISPLAY MODE SWITCHER & RESPONSIVE UX =====
const btnToggleViewMode = document.getElementById('btn-toggle-view-mode');
if (btnToggleViewMode) {
    btnToggleViewMode.onclick = () => {
        if (activeDisplayMode === 'grid') {
            activeDisplayMode = 'speaker';
            btnToggleViewMode.querySelector('span').textContent = 'Докладчик';
        } else if (activeDisplayMode === 'speaker') {
            activeDisplayMode = 'carousel';
            btnToggleViewMode.querySelector('span').textContent = 'Карусель';
            carouselIndex = 0;
        } else {
            activeDisplayMode = 'grid';
            btnToggleViewMode.querySelector('span').textContent = 'Сетка';
        }
        updateVideoGridClass();
        showAlert(`Режим показа изменен на: ${btnToggleViewMode.querySelector('span').textContent}`);
    };
}

const btnCarouselPrev = document.getElementById('btn-carousel-prev');
const btnCarouselNext = document.getElementById('btn-carousel-next');

if (btnCarouselPrev) {
    btnCarouselPrev.onclick = () => {
        const grid = ui.videoGrid;
        if (!grid) return;
        const tilesCount = grid.querySelectorAll('.video-wrapper').length;
        if (tilesCount <= 1) return;
        carouselIndex = (carouselIndex - 1 + tilesCount) % tilesCount;
        updateVideoGridClass();
    };
}

if (btnCarouselNext) {
    btnCarouselNext.onclick = () => {
        const grid = ui.videoGrid;
        if (!grid) return;
        const tilesCount = grid.querySelectorAll('.video-wrapper').length;
        if (tilesCount <= 1) return;
        carouselIndex = (carouselIndex + 1) % tilesCount;
        updateVideoGridClass();
    };
}

// Swipe support on Mobile Touch devices
let touchStartX = 0;
let touchEndX = 0;

if (ui.videoGrid) {
    ui.videoGrid.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    ui.videoGrid.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
}

function handleSwipe() {
    if (activeDisplayMode !== 'carousel') return;
    const diff = touchStartX - touchEndX;
    const threshold = 50; // swipe threshold in px
    
    const grid = ui.videoGrid;
    if (!grid) return;
    const tilesCount = grid.querySelectorAll('.video-wrapper').length;
    if (tilesCount <= 1) return;
    
    if (diff > threshold) {
        // Swipe left -> Next tile
        carouselIndex = (carouselIndex + 1) % tilesCount;
        updateVideoGridClass();
    } else if (diff < -threshold) {
        // Swipe right -> Prev tile
        carouselIndex = (carouselIndex - 1 + tilesCount) % tilesCount;
        updateVideoGridClass();
    }
}
