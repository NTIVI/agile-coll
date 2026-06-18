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
    micOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icon"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`,
    micOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icon"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><path d="M17 11a7 7 0 0 1-14 0v-1M19 10v1a7.14 7.14 0 0 1-.5 2.5"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`,
    camOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icon"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
    camOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icon"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34M10.59 10.59a4 4 0 1 0 5.66 5.66"></path></svg>`
};

const DISCORD_AVATAR_COLORS = ['#5865F2', '#23A55A', '#F23F43', '#F0B232', '#EB459E', '#9B59B6', '#1ABC9C', '#E67E22'];
let selectedColor = DISCORD_AVATAR_COLORS[0];

// Global variables
let localStream;
let displayStream;
let peerConnections = {}; // id -> { pc, user, audio: true, video: true }
let ws;
let currentRoomId = null;
let currentServerCode = 'AGILE_CALL';
let currentServerOwnerId = null;
let currentChannelId = null;
let isHost = false;
let myUser = { id: Math.floor(Math.random() * 100000), first_name: 'Пользователь', role: 'пользователь' };

let isAudioEnabled = true;
let isVideoEnabled = true;
let isDeafened = false;

let recognition; // Web Speech API
let myRemoteId = Math.floor(100000 + Math.random() * 900000).toString();
let controlledPartnerId = null;
let myClientId = null;
let activeDisplayMode = 'grid'; // 'grid' | 'speaker' | 'carousel'
let carouselIndex = 0;
let pendingServerCode = null;

// Web Audio API Context for Sounds and VAD
let audioCtx;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// Play synthesized Discord sound effects
function playDiscordSound(type) {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        const now = ctx.currentTime;
        
        if (type === 'connect') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.frequency.setValueAtTime(450, now);
            osc.frequency.setValueAtTime(600, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'disconnect') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.setValueAtTime(450, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'mute') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'unmute') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.frequency.setValueAtTime(350, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        }
    } catch(err) {
        console.warn('AudioContext sound failed to play:', err);
    }
}

// Client UI mappings
const ui = {
    entryAnimation: document.getElementById('entry-animation'),
    
    // Screens
    homeScreen: document.getElementById('agile-home-screen'),
    callScreen: document.getElementById('agile-call-screen'),
    
    // Home Dashboard UI
    homeCreateNameInput: document.getElementById('home-create-name-input'),
    homeJoinCodeInput: document.getElementById('home-join-code-input'),
    btnHomeCreate: document.getElementById('btn-home-create'),
    btnHomeJoin: document.getElementById('btn-home-join'),
    
    // Call Header UI
    activeChannelNameText: document.getElementById('active-channel-name'),
    currentRoomIdText: document.getElementById('current-room-id'),
    btnHeaderInvite: document.getElementById('btn-header-invite'),
    videoGrid: document.getElementById('video-grid'),
    
    // Collapsible Chat Drawer UI
    chatDrawer: document.getElementById('chat-drawer'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    btnSendChat: document.getElementById('btn-send-chat'),
    speechDot: document.getElementById('speech-dot'),
    speechStatusText: document.getElementById('speech-status-text'),
    
    // Bottom floating call control bar
    btnCallCam: document.getElementById('btn-call-cam'),
    btnCallMic: document.getElementById('btn-call-mic'),
    btnCallShare: document.getElementById('btn-call-share'),
    btnCallRemote: document.getElementById('btn-call-remote'),
    btnLeave: document.getElementById('btn-leave'),
    
    // Modals
    profileSettingsModal: document.getElementById('profile-settings-modal'),
    settingsUsernameInput: document.getElementById('settings-username-input'),
    btnSaveProfileSettings: document.getElementById('btn-save-profile-settings'),
    btnCloseProfileSettings: document.getElementById('btn-close-profile-settings'),
    
    inviteCodeModal: document.getElementById('invite-code-modal'),
    inviteCodeDisplay: document.getElementById('invite-code-display'),
    btnCopyInviteLink: document.getElementById('btn-copy-invite-link'),
    btnCloseInviteModal: document.getElementById('btn-close-invite-modal'),
    
    adminPanel: document.getElementById('admin-panel'),
    btnCloseAdmin: document.getElementById('btn-close-admin'),
    participantsList: document.getElementById('participants-list'),
    
    btnBreakoutPanel: document.getElementById('btn-breakout-panel'),
    btnReturnToMain: document.getElementById('btn-return-to-main'),
    breakoutPanel: document.getElementById('breakout-panel'),
    btnCloseBreakout: document.getElementById('btn-close-breakout'),
    breakoutParticipantsList: document.getElementById('breakout-participants-list'),
    btnStartBreakout: document.getElementById('btn-start-breakout'),
    
    // Remote Control
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
    const roomParam = urlParams.get('room') || urlParams.get('join') || urlParams.get('code');
    if (roomParam) {
        setTimeout(() => {
            joinServer(roomParam);
        }, 2200);
    }
});

// Update Profile Footer Display panel
function updateProfilePanel() {
    const avatar = document.getElementById('my-profile-avatar');
    const name = document.getElementById('my-profile-name');
    const tag = document.querySelector('.profile-tag');
    
    if (avatar) {
        avatar.textContent = getInitials(myUser.first_name);
        avatar.style.backgroundColor = myUser.avatarColor || getAvatarColor(myUser.first_name);
    }
    if (name) {
        name.textContent = myUser.first_name;
    }
    if (tag) {
        tag.textContent = `#${(myUser.email.length * 17) % 10000}`;
    }
}

// Compute initials
function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

// Get deterministic avatar background color based on name
function getAvatarColor(name) {
    if (!name) return '#5865F2';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % DISCORD_AVATAR_COLORS.length;
    return DISCORD_AVATAR_COLORS[index];
}

// ===== REGISTRATION & AUTHENTICATION HANDLERS =====
function showAuthForm() {
    document.getElementById('agile-app-container').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'flex';
    renderColorPicker();
}

function renderColorPicker() {
    const picker = document.getElementById('avatar-color-picker');
    if (!picker) return;
    picker.innerHTML = '';
    
    DISCORD_AVATAR_COLORS.forEach(color => {
        const opt = document.createElement('div');
        opt.className = 'color-option';
        opt.style.backgroundColor = color;
        if (color === selectedColor) {
            opt.classList.add('selected');
        }
        opt.onclick = () => {
            document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
            opt.classList.add('selected');
            selectedColor = color;
        };
        picker.appendChild(opt);
    });
}

function onUserLoggedIn() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('agile-app-container').style.display = 'flex';
    updateProfilePanel();
    
    // Check role to show Admin button
    const btnAdmin = document.getElementById('btn-server-admin');
    const dividerAdmin = document.getElementById('admin-sidebar-divider');
    if (myUser.role === 'админ') {
        if (btnAdmin) btnAdmin.style.display = 'flex';
        if (dividerAdmin) dividerAdmin.style.display = 'block';
    } else {
        if (btnAdmin) btnAdmin.style.display = 'none';
        if (dividerAdmin) dividerAdmin.style.display = 'none';
    }
    
    // Connect to system default room lobby
    joinServer('AGILE_CALL');
}

async function registerUser() {
    const username = document.getElementById('auth-reg-username').value.trim();
    const email = document.getElementById('auth-reg-email').value.trim();
    const password = document.getElementById('auth-reg-password').value.trim();
    
    if (!username || !email || !password) {
        showAlert('Пожалуйста, заполните все поля');
        return;
    }
    
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, avatarColor: selectedColor })
        });
        const data = await res.json();
        
        if (data.success) {
            myUser = data.user;
            localStorage.setItem('agile_call_user', JSON.stringify(myUser));
            onUserLoggedIn();
        } else {
            showAlert(data.message);
        }
    } catch(err) {
        console.error(err);
        showAlert('Ошибка подключения к серверу');
    }
}

async function loginUser() {
    const email = document.getElementById('auth-login-email').value.trim();
    const password = document.getElementById('auth-login-password').value.trim();
    
    if (!email || !password) {
        showAlert('Пожалуйста, заполните все поля');
        return;
    }
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (data.success) {
            myUser = data.user;
            localStorage.setItem('agile_call_user', JSON.stringify(myUser));
            onUserLoggedIn();
        } else {
            showAlert(data.message);
        }
    } catch(err) {
        console.error(err);
        showAlert('Ошибка подключения к серверу');
    }
}

async function autoLoginTelegram(tgUser) {
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: tgUser.first_name,
                email: `tg_${tgUser.id}@telegram.com`,
                password: `tg_${tgUser.id}`,
                avatarColor: '#5865F2'
            })
        });
        const data = await res.json();
        if (data.success) {
            myUser = data.user;
            localStorage.setItem('agile_call_user', JSON.stringify(myUser));
            onUserLoggedIn();
        } else {
            showAuthForm();
        }
    } catch(err) {
        console.error(err);
        showAuthForm();
    }
}

// Bind auth switch forms links
const linkToLogin = document.getElementById('link-switch-to-login');
const linkToRegister = document.getElementById('link-switch-to-register');
if (linkToLogin) {
    linkToLogin.onclick = () => {
        document.getElementById('auth-register-form').style.display = 'none';
        document.getElementById('auth-login-form').style.display = 'flex';
        document.getElementById('auth-card-title').textContent = 'Войти в аккаунт';
        document.getElementById('auth-card-subtitle').textContent = 'Введите ваши учетные данные для входа';
    };
}
if (linkToRegister) {
    linkToRegister.onclick = () => {
        document.getElementById('auth-register-form').style.display = 'flex';
        document.getElementById('auth-login-form').style.display = 'none';
        document.getElementById('auth-card-title').textContent = 'Создать аккаунт';
        document.getElementById('auth-card-subtitle').textContent = 'Введите ваши данные для регистрации';
    };
}

const regSubmit = document.getElementById('btn-auth-register-submit');
if (regSubmit) regSubmit.onclick = registerUser;

const loginSubmit = document.getElementById('btn-auth-login-submit');
if (loginSubmit) loginSubmit.onclick = loginUser;

const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.onclick = () => {
        localStorage.removeItem('agile_call_user');
        myUser = { id: Math.floor(Math.random() * 100000), first_name: 'Пользователь', role: 'пользователь' };
        
        document.getElementById('agile-app-container').style.display = 'none';
        document.getElementById('auth-overlay').style.display = 'flex';
        
        leaveVoiceChannelSilent();
        showAuthForm();
    };
}

// Check initial authentication state
if (tg.initDataUnsafe?.user) {
    autoLoginTelegram(tg.initDataUnsafe.user);
} else {
    const savedUser = localStorage.getItem('agile_call_user');
    if (savedUser) {
        try {
            myUser = JSON.parse(savedUser);
            onUserLoggedIn();
        } catch(e) {
            showAuthForm();
        }
    } else {
        showAuthForm();
    }
}

// ===== INTERFACE LOGIC & WEBRTC =====

// Initialize Local Media Stream
async function initLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        // Start client-side voice activity detection for local stream
        monitorSpeakingState(localStream, 'local-video-container');
        updateMediaButtons();
        initSpeechToText();
    } catch (e) {
        console.error('Ошибка доступа к медиа:', e);
        showAlert('Разрешите доступ к камере и микрофону в настройках вашего устройства');
    }
}

// Toggle Audio states
function toggleAudio() {
    toggleAudioSilent();
    playDiscordSound(isAudioEnabled ? 'unmute' : 'mute');
}

function toggleAudioSilent() {
    if (!localStream) return;
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks()[0].enabled = isAudioEnabled;
    updateMediaButtons();
    
    const localMic = document.getElementById('local-mic-muted');
    if (localMic) {
        localMic.style.display = isAudioEnabled ? 'none' : 'flex';
    }

    if (recognition) {
        if (isAudioEnabled && !isDeafened) {
            try { recognition.start(); } catch (err) {}
        } else {
            recognition.stop();
        }
    }
    broadcastMediaState();
}

// Toggle Video states
function toggleVideo() {
    if (!localStream) return;
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    updateMediaButtons();

    const localCam = document.getElementById('local-cam-placeholder');
    if (localCam) {
        localCam.style.display = isVideoEnabled ? 'none' : 'flex';
    }
    broadcastMediaState();
}

// Toggle Deafen states
function toggleDeafen() {
    isDeafened = !isDeafened;
    
    if (isDeafened) {
        if (isAudioEnabled) {
            toggleAudioSilent();
        }
    } else {
        if (!isAudioEnabled) {
            toggleAudioSilent();
        }
    }
    
    for (let peerId in peerConnections) {
        const videoEl = document.getElementById(`video-${peerId}`);
        if (videoEl) {
            videoEl.muted = isDeafened;
        }
    }
    
    const btnDeafen = document.getElementById('btn-profile-deafen');
    if (btnDeafen) {
        if (isDeafened) {
            btnDeafen.classList.add('active');
            btnDeafen.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`;
        } else {
            btnDeafen.classList.remove('active');
            btnDeafen.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`;
        }
    }
    
    playDiscordSound(isDeafened ? 'mute' : 'unmute');
    broadcastMediaState();
}

function updateMediaButtons() {
    const btnProfileMic = document.getElementById('btn-profile-mic');
    const btnCallMic = ui.btnCallMic;
    const btnCallCam = ui.btnCallCam;

    if (isAudioEnabled) {
        if (btnProfileMic) {
            btnProfileMic.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
            btnProfileMic.classList.remove('active');
        }
        if (btnCallMic) {
            btnCallMic.innerHTML = SVGS.micOn;
            btnCallMic.classList.remove('muted');
        }
    } else {
        if (btnProfileMic) {
            btnProfileMic.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><path d="M17 11a7 7 0 0 1-14 0v-1M19 10v1a7.14 7.14 0 0 1-.5 2.5"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
            btnProfileMic.classList.add('active');
        }
        if (btnCallMic) {
            btnCallMic.innerHTML = SVGS.micOff;
            btnCallMic.classList.add('muted');
        }
    }

    if (isVideoEnabled) {
        if (btnCallCam) {
            btnCallCam.innerHTML = SVGS.camOn;
            btnCallCam.classList.remove('muted');
        }
    } else {
        if (btnCallCam) {
            btnCallCam.innerHTML = SVGS.camOff;
            btnCallCam.classList.add('muted');
        }
    }
}

if (document.getElementById('btn-profile-mic')) document.getElementById('btn-profile-mic').onclick = toggleAudio;
if (ui.btnCallMic) ui.btnCallMic.onclick = toggleAudio;
if (ui.btnCallCam) ui.btnCallCam.onclick = toggleVideo;
if (document.getElementById('btn-profile-deafen')) document.getElementById('btn-profile-deafen').onclick = toggleDeafen;

// Client side voice activity detection using Web Audio API
function monitorSpeakingState(stream, elementId) {
    if (!stream || stream.getAudioTracks().length === 0) return;
    
    try {
        const ctx = getAudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let speakTimeout = null;
        
        function checkVolume() {
            if (!stream.active) {
                source.disconnect();
                analyser.disconnect();
                return;
            }
            
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            
            const isMuted = stream.getAudioTracks()[0].enabled === false;
            
            if (average > 18 && !isMuted) {
                const wrapper = document.getElementById(elementId);
                const sidebarUser = document.getElementById(`sidebar-user-${elementId}`);
                
                if (wrapper) wrapper.classList.add('speaking');
                if (sidebarUser) sidebarUser.classList.add('speaking');
                
                if (speakTimeout) clearTimeout(speakTimeout);
                speakTimeout = setTimeout(() => {
                    if (wrapper) wrapper.classList.remove('speaking');
                    if (sidebarUser) sidebarUser.classList.remove('speaking');
                }, 400);
            }
            requestAnimationFrame(checkVolume);
        }
        checkVolume();
    } catch (err) {
        console.error('Audio analyzer setup error:', err);
    }
}

// Switch server view visual details
function updateServerUI() {
    if (ui.sidebarServerName) {
        ui.sidebarServerName.textContent = currentServerCode.replace(/_/g, ' ');
    }
    const serverBtn = document.getElementById('btn-server-agile');
    if (serverBtn) {
        serverBtn.innerHTML = `<strong>${currentServerCode.slice(0, 2).toUpperCase()}</strong>`;
        serverBtn.classList.add('active');
        document.getElementById('btn-server-home').classList.remove('active');
        const btnAdmin = document.getElementById('btn-server-admin');
        if (btnAdmin) btnAdmin.classList.remove('active');
    }
    updateInviteButtonVisibility();
}

// Show/Hide Invite Button for Server Creator
function updateInviteButtonVisibility() {
    const btnInvite = document.getElementById('btn-sidebar-invite');
    if (!btnInvite) return;
    
    // Check if the current user is the owner/creator of the current server
    const isOwner = myUser && currentServerOwnerId && (myUser.id.toString() === currentServerOwnerId.toString());
    
    if (isOwner) {
        btnInvite.style.display = 'flex';
    } else {
        btnInvite.style.display = 'none';
    }
}

// Connect to Server Lobby (observation mode, no media permissions requested)
function connectServerLobby() {
    leaveVoiceChannelSilent();
    
    currentRoomId = `${currentServerCode}_lobby`;
    currentChannelId = null;
    
    connectWebSocket();
}

// Create new server (with limit enforcement)
async function createServer() {
    const nameInput = document.getElementById('home-create-name-input');
    const pwdInput = document.getElementById('home-create-password-input');
    const name = nameInput.value.trim();
    const password = pwdInput.value.trim();
    
    if (!name) {
        showAlert('Пожалуйста, введите название сервера');
        return;
    }
    
    const code = name.toUpperCase().replace(/\s+/g, '_').substring(0, 15);
    
    try {
        const res = await fetch('/api/create-server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                code,
                password,
                userId: myUser.id
            })
        });
        const data = await res.json();
        
        if (data.success) {
            nameInput.value = '';
            pwdInput.value = '';
            joinServer(data.server.code);
        } else {
            showAlert(data.message);
        }
    } catch(err) {
        console.error(err);
        showAlert('Ошибка создания сервера');
    }
}

// Join server (validating passwords)
async function joinServer(serverCode, password = '') {
    if (!serverCode) return;
    const code = serverCode.toUpperCase().replace(/\s+/g, '_').trim();
    
    try {
        const res = await fetch('/api/join-server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, password: password })
        });
        const data = await res.json();
        
        if (data.success) {
            closePasswordModal();
            currentServerCode = data.server.code;
            currentServerOwnerId = data.server.ownerId;
            updateServerUI();
            connectServerLobby();
            
            // Switch view back to home screen
            if (ui.homeScreen) ui.homeScreen.style.display = 'flex';
            if (ui.callScreen) ui.callScreen.style.display = 'none';
            if (document.getElementById('agile-admin-screen')) {
                document.getElementById('agile-admin-screen').style.display = 'none';
            }
        } else if (data.requiresPassword) {
            pendingServerCode = code;
            showPasswordModal();
            if (password) {
                showAlert('Неверный пароль сервера!');
            }
        } else {
            showAlert(data.message);
        }
    } catch(err) {
        console.error(err);
        showAlert('Ошибка подключения к серверу');
    }
}

// Server Password Modal helpers
function showPasswordModal() {
    const modal = document.getElementById('server-password-modal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('server-join-pwd-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function closePasswordModal() {
    const modal = document.getElementById('server-password-modal');
    if (modal) modal.style.display = 'none';
    pendingServerCode = null;
}

const btnClosePwdModal = document.getElementById('btn-close-pwd-modal');
if (btnClosePwdModal) btnClosePwdModal.onclick = closePasswordModal;

const btnServerPwdSubmit = document.getElementById('btn-server-pwd-submit');
if (btnServerPwdSubmit) {
    btnServerPwdSubmit.onclick = () => {
        const input = document.getElementById('server-join-pwd-input');
        if (input && pendingServerCode) {
            joinServer(pendingServerCode, input.value.trim());
        }
    };
}

if (ui.btnHomeCreate) ui.btnHomeCreate.onclick = createServer;
if (ui.btnHomeJoin) {
    ui.btnHomeJoin.onclick = () => {
        const code = ui.homeJoinCodeInput.value.trim();
        if (code) {
            joinServer(code);
        } else {
            showAlert('Введите инвайт-код сервера');
        }
    };
}

// Servers sidebar button clicks
document.getElementById('btn-server-home').onclick = () => {
    document.getElementById('btn-server-home').classList.add('active');
    document.getElementById('btn-server-agile').classList.remove('active');
    const btnAdmin = document.getElementById('btn-server-admin');
    if (btnAdmin) btnAdmin.classList.remove('active');
    
    leaveCall();
    if (ui.homeScreen) ui.homeScreen.style.display = 'flex';
    if (ui.callScreen) ui.callScreen.style.display = 'none';
    if (document.getElementById('agile-admin-screen')) {
        document.getElementById('agile-admin-screen').style.display = 'none';
    }
};

document.getElementById('btn-server-agile').onclick = () => {
    updateServerUI();
    if (ui.homeScreen) ui.homeScreen.style.display = 'flex';
    if (ui.callScreen) ui.callScreen.style.display = 'none';
    if (document.getElementById('agile-admin-screen')) {
        document.getElementById('agile-admin-screen').style.display = 'none';
    }
};

document.getElementById('btn-server-add').onclick = () => {
    const code = prompt('Введите код приглашения для подключения к серверу:');
    if (code) {
        joinServer(code);
    }
};

// Admin panel crown button click
const btnAdminServer = document.getElementById('btn-server-admin');
if (btnAdminServer) {
    btnAdminServer.onclick = () => {
        btnAdminServer.classList.add('active');
        document.getElementById('btn-server-home').classList.remove('active');
        document.getElementById('btn-server-agile').classList.remove('active');
        
        leaveVoiceChannelSilent();
        
        if (ui.homeScreen) ui.homeScreen.style.display = 'none';
        if (ui.callScreen) ui.callScreen.style.display = 'none';
        if (document.getElementById('agile-admin-screen')) {
            document.getElementById('agile-admin-screen').style.display = 'flex';
        }
        
        loadAdminData();
    };
}

// Voice channels click handler
document.querySelectorAll('.channels-sidebar .channel-item[data-channel-id]').forEach(btn => {
    btn.onclick = (e) => {
        e.preventDefault();
        const channelId = btn.getAttribute('data-channel-id');
        joinVoiceChannel(channelId);
    };
});

// Join Voice Channel
async function joinVoiceChannel(channelId) {
    if (currentChannelId === channelId) return;
    
    playDiscordSound('connect');
    leaveVoiceChannelSilent();
    
    currentChannelId = channelId;
    currentRoomId = `${currentServerCode}_${channelId}`;
    
    document.querySelectorAll('.channels-sidebar .channel-item').forEach(el => {
        el.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.channels-sidebar .channel-item[data-channel-id="${channelId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    const chName = activeBtn ? activeBtn.textContent.trim() : channelId;
    if (ui.activeChannelNameText) {
        ui.activeChannelNameText.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            ${chName}
        `;
    }
    
    if (ui.homeScreen) ui.homeScreen.style.display = 'none';
    if (document.getElementById('agile-admin-screen')) {
        document.getElementById('agile-admin-screen').style.display = 'none';
    }
    if (ui.callScreen) ui.callScreen.style.display = 'flex';
    
    if (ui.currentRoomIdText) ui.currentRoomIdText.textContent = currentServerCode;
    if (ui.inviteCodeDisplay) ui.inviteCodeDisplay.textContent = currentServerCode;
    
    if (ui.chatMessages) ui.chatMessages.innerHTML = '';
    
    // Acquire webcam/mic media when joining call
    await initLocalMedia();
    addLocalVideoToGrid();
    connectWebSocket();
    
    if (recognition && isAudioEnabled) {
        try { recognition.start(); } catch (err) {}
    }
}

// Silent disconnect helper when switching channels
function leaveVoiceChannelSilent() {
    if (displayStream) stopScreenShare();
    if (recognition) {
        try { recognition.stop(); } catch(e) {}
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    for (let peerId in peerConnections) {
        peerConnections[peerId].pc.close();
    }
    peerConnections = {};
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    if (ui.videoGrid) ui.videoGrid.innerHTML = '';
    clearSidebarChannelOccupancy();
}

// Disconnect call completely
if (ui.btnLeave) ui.btnLeave.onclick = leaveCall;

function leaveCall() {
    if (!currentRoomId) return;
    
    playDiscordSound('disconnect');
    leaveVoiceChannelSilent();
    
    currentChannelId = null;
    
    document.querySelectorAll('.channels-sidebar .channel-item').forEach(el => {
        el.classList.remove('active');
    });
    
    if (ui.homeScreen) ui.homeScreen.style.display = 'flex';
    if (ui.callScreen) ui.callScreen.style.display = 'none';
    if (document.getElementById('agile-admin-screen')) {
        document.getElementById('agile-admin-screen').style.display = 'none';
    }
    
    // Connect back to server lobby to track occupants
    connectServerLobby();
}

function clearSidebarChannelOccupancy() {
    document.querySelectorAll('.channels-sidebar .channel-users-list').forEach(list => {
        list.innerHTML = '';
    });
}

// Populate the sidebar user listing in real-time
function renderSidebarChannelOccupancy(channelsData) {
    clearSidebarChannelOccupancy();
    if (!channelsData) return;
    
    for (const chName in channelsData) {
        const container = document.getElementById(`vc-users-${chName}`);
        if (!container) continue;
        
        const participants = channelsData[chName];
        participants.forEach(p => {
            const isLocal = p.id === myClientId;
            const item = document.createElement('div');
            item.className = 'sidebar-user-item';
            item.id = `sidebar-user-${isLocal ? 'local-video-container' : `video-container-${p.id}`}`;
            
            const initials = getInitials(p.user.first_name);
            const avatarColor = p.user.avatarColor || getAvatarColor(p.user.first_name);
            
            const muteSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><path d="M17 11a7 7 0 0 1-14 0v-1M19 10v1a7.14 7.14 0 0 1-.5 2.5"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
            const camOffSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34M10.59 10.59a4 4 0 1 0 5.66 5.66"></path></svg>`;
            
            let statusIcons = '';
            if (!p.mediaState.audio) {
                statusIcons += muteSvg;
            }
            if (!p.mediaState.video) {
                statusIcons += camOffSvg;
            }
            
            item.innerHTML = `
                <div class="sidebar-user-left">
                    <div class="sidebar-user-avatar" style="background-color: ${avatarColor}">
                        ${initials}
                    </div>
                    <span>${p.user.first_name}${isLocal ? ' (Вы)' : ''}</span>
                </div>
                <div class="sidebar-user-icons">
                    ${statusIcons}
                </div>
            `;
            container.appendChild(item);
        });
    }
}

// 3. Grid sizing algorithm
function updateVideoGridClass() {
    const grid = ui.videoGrid;
    if (!grid) return;
    
    grid.classList.remove('mode-grid', 'mode-speaker', 'mode-carousel', 'grid-1-player', 'grid-2-players', 'grid-many-players');
    
    const scrollRow = grid.querySelector('.speaker-scroll-row');
    if (scrollRow) {
        const children = Array.from(scrollRow.children);
        children.forEach(child => grid.appendChild(child));
        scrollRow.remove();
    }
    
    const tiles = Array.from(grid.querySelectorAll('.video-wrapper'));
    const tilesCount = tiles.length;
    
    tiles.forEach(tile => {
        tile.style.display = 'block';
        tile.classList.remove('main-focus', 'active-slide');
    });
    
    const carouselControls = document.getElementById('carousel-controls');
    if (carouselControls) carouselControls.style.display = 'none';
    
    if (activeDisplayMode === 'speaker' && tilesCount > 1) {
        grid.classList.add('mode-speaker');
        let focusTile = tiles.find(tile => tile.id !== 'local-video-container');
        if (!focusTile) focusTile = tiles[0];
        
        if (focusTile) {
            focusTile.classList.add('main-focus');
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
        
        if (carouselControls) {
            carouselControls.style.display = 'flex';
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

// Add local video stream card to grid
function addLocalVideoToGrid() {
    if (!ui.videoGrid) return;
    
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
    
    const camPlaceholder = document.createElement('div');
    camPlaceholder.className = 'camera-off-placeholder';
    camPlaceholder.id = 'local-cam-placeholder';
    camPlaceholder.style.display = isVideoEnabled ? 'none' : 'flex';
    camPlaceholder.innerHTML = `
        <div class="placeholder-avatar" style="background-color: ${myUser.avatarColor || getAvatarColor(myUser.first_name)}">${getInitials(myUser.first_name)}</div>
        <div class="placeholder-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.2rem;height:1.2rem;"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M7 7H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4M21 9l-4 3v-2a2 2 0 0 0-2-2H9"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Камера выключена
        </div>
    `;

    const micMutedOverlay = document.createElement('div');
    micMutedOverlay.className = 'mic-muted-overlay';
    micMutedOverlay.id = 'local-mic-muted';
    micMutedOverlay.style.display = isAudioEnabled ? 'none' : 'flex';
    micMutedOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1M5 10v1a7 7 0 0 0 10.8 5.9M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
    `;

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

// Copy invite triggers
if (ui.btnHeaderInvite) {
    ui.btnHeaderInvite.onclick = () => {
        if (ui.inviteCodeModal) ui.inviteCodeModal.style.display = 'flex';
    };
}
const btnSidebarInvite = document.getElementById('btn-sidebar-invite');
if (btnSidebarInvite) {
    btnSidebarInvite.onclick = () => {
        if (ui.inviteCodeDisplay) {
            ui.inviteCodeDisplay.textContent = currentServerCode;
        }
        if (ui.inviteCodeModal) {
            ui.inviteCodeModal.style.display = 'flex';
        }
    };
}
if (document.getElementById('btn-close-invite-modal')) {
    document.getElementById('btn-close-invite-modal').onclick = () => {
        if (ui.inviteCodeModal) ui.inviteCodeModal.style.display = 'none';
    };
}
if (ui.btnCopyInviteLink) {
    ui.btnCopyInviteLink.onclick = () => {
        const link = window.location.origin + '?code=' + currentServerCode;
        navigator.clipboard.writeText(link).then(() => {
            showAlert('Ссылка скопирована!');
            if (ui.inviteCodeModal) ui.inviteCodeModal.style.display = 'none';
        }).catch(() => {
            alert('Ссылка: ' + link);
        });
    };
}

// Settings modal triggers
if (ui.btnProfileSettings) {
    ui.btnProfileSettings.onclick = () => {
        if (ui.settingsUsernameInput) {
            ui.settingsUsernameInput.value = myUser.first_name;
        }
        if (ui.profileSettingsModal) {
            ui.profileSettingsModal.style.display = 'flex';
        }
    };
}
if (ui.btnCloseProfileSettings) {
    ui.btnCloseProfileSettings.onclick = () => {
        if (ui.profileSettingsModal) ui.profileSettingsModal.style.display = 'none';
    };
}
if (ui.btnSaveProfileSettings) {
    ui.btnSaveProfileSettings.onclick = async () => {
        const nameVal = ui.settingsUsernameInput.value.trim();
        if (nameVal && nameVal !== myUser.first_name) {
            myUser.first_name = nameVal;
            localStorage.setItem('agile_call_user', JSON.stringify(myUser));
            updateProfilePanel();
            
            const localLabel = document.querySelector('#local-video-container .participant-label');
            if (localLabel) {
                localLabel.textContent = myUser.first_name + ' (Вы)';
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'join',
                    roomId: currentRoomId,
                    initData: tg.initData,
                    user: myUser
                }));
            }
        }
        if (ui.profileSettingsModal) ui.profileSettingsModal.style.display = 'none';
    };
}

// Side Chat Drawer Visibility
if (ui.btnToggleChat) {
    ui.btnToggleChat.onclick = () => {
        if (ui.chatDrawer) {
            ui.chatDrawer.classList.toggle('hidden');
        }
    };
}
if (ui.chatDrawer && document.getElementById('btn-close-chat')) {
    document.getElementById('btn-close-chat').onclick = () => {
        ui.chatDrawer.classList.add('hidden');
    };
}

// Send Text Message
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
    msg.className = 'msg-bubble';
    
    const sender = document.createElement('div');
    sender.className = `msg-sender ${isSelf ? 'self' : ''}`;
    sender.textContent = isSelf ? 'Вы' : senderName;
    
    const now = new Date();
    sender.setAttribute('data-time', now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    
    const txt = document.createElement('div');
    txt.className = 'msg-text';
    txt.textContent = text;
    
    msg.appendChild(sender);
    msg.appendChild(txt);
    ui.chatMessages.appendChild(msg);
    
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
}

// Speech to text initialization
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

function broadcastMediaState() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'media-state',
            audio: isAudioEnabled,
            video: isVideoEnabled
        }));
    }
}

// WebSocket Signaling connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const serverHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'localhost:3000' 
        : window.location.host;
        
    ws = new WebSocket(`${protocol}://${serverHost}`);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            roomId: currentRoomId,
            initData: tg.initData,
            user: myUser
        }));
        
        if (currentChannelId) {
            setTimeout(broadcastMediaState, 500);
        }
    };
    
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'joined':
                isHost = data.isHost;
                myClientId = data.yourId;
                updateHostUI();
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
                updateHostUI();
                updateAdminPanel();
                break;
                
            case 'host-revoked':
                isHost = false;
                updateHostUI();
                updateAdminPanel();
                break;
                
            case 'move-to-breakout':
                moveToBreakout(data.breakoutRoomId);
                break;
                
            case 'admin-action':
                handleAdminAction(data.action);
                break;
                
            case 'kicked':
                showAlert('Вы были удалены из конференции организатором');
                leaveCall();
                break;
                
            case 'media-state':
                handleRemoteMediaState(data.sender, data.audio, data.video);
                break;
                
            case 'speech-text':
                addChatMessage(data.senderName || 'Собеседник', data.text, false);
                displaySubtitle(data.sender, data.text);
                break;
                
            case 'remote-control':
                handleRemoteControlMessage(data);
                break;
                
            case 'channel-states':
                renderSidebarChannelOccupancy(data.channels);
                break;
                
            case 'error':
                alert(data.message);
                leaveCall();
                break;
        }
    };
}

// Setup Peer Connections (WebRTC)
function createPeerConnection(peerId, user, isCaller) {
    if (!localStream) return; // Only for call rooms
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = { pc, user, audio: true, video: true };
    
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
    if (!peer) return;
    
    const pc = peer.pc;
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    ws.send(JSON.stringify({ type: 'answer', target: data.caller, sdp: pc.localDescription }));
}

// Add remote video card to grid
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
    video.muted = isDeafened;
    
    const camPlaceholder = document.createElement('div');
    camPlaceholder.className = 'camera-off-placeholder';
    camPlaceholder.id = `cam-placeholder-${peerId}`;
    camPlaceholder.style.display = 'none'; 
    camPlaceholder.innerHTML = `
        <div class="placeholder-avatar" style="background-color: ${user?.avatarColor || getAvatarColor(user?.first_name)}">${getInitials(user?.first_name)}</div>
        <div class="placeholder-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.2rem;height:1.2rem;"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M7 7H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4M21 9l-4 3v-2a2 2 0 0 0-2-2H9"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Камера выключена
        </div>
    `;

    const micMutedOverlay = document.createElement('div');
    micMutedOverlay.className = 'mic-muted-overlay';
    micMutedOverlay.id = `mic-muted-${peerId}`;
    micMutedOverlay.style.display = 'none';
    micMutedOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" x2="22" y1="2" y2="22"></line><path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1M5 10v1a7 7 0 0 0 10.8 5.9M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
    `;

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
    
    monitorSpeakingState(stream, `video-container-${peerId}`);
    broadcastMediaState();
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

// Screen Sharing
if (ui.btnCallShare) {
    ui.btnCallShare.onclick = async () => {
        try {
            if (displayStream) return stopScreenShare();
            displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = displayStream.getVideoTracks()[0];
            
            for (let peerId in peerConnections) {
                const sender = peerConnections[peerId].pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            }
            
            const localVideo = document.querySelector('#local-video-container video');
            if (localVideo) {
                localVideo.srcObject = displayStream;
                localVideo.classList.remove('mirrored');
            }
            ui.btnCallShare.classList.add('active-red');
            const localPlaceholder = document.getElementById('local-cam-placeholder');
            if (localPlaceholder) localPlaceholder.style.display = 'none';
            screenTrack.onended = () => stopScreenShare();
        } catch (e) {
            console.error(e);
            showAlert('Трансляция экрана отменена');
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
        if (sender) sender.replaceTrack(cameraTrack);
    }
    
    const localVideo = document.querySelector('#local-video-container video');
    if (localVideo) {
        localVideo.srcObject = localStream;
        if (isVideoEnabled) localVideo.classList.add('mirrored');
    }
    ui.btnCallShare.classList.remove('active-red');
    const localPlaceholder = document.getElementById('local-cam-placeholder');
    if (localPlaceholder) {
        localPlaceholder.style.display = isVideoEnabled ? 'none' : 'flex';
    }
}

function updateHostUI() {
    const showAdmin = isHost;
    const showBreakout = isHost && (currentRoomId && currentRoomId.startsWith('AGILE_CALL_'));
    
    if (ui.btnAdminPanel) {
        ui.btnAdminPanel.style.display = showAdmin ? 'block' : 'none';
    }
    if (ui.btnBreakoutPanel) {
        ui.btnBreakoutPanel.style.display = showBreakout ? 'block' : 'none';
    }
}

// Breakout Rooms Migration
function moveToBreakout(breakoutRoomId) {
    showAlert('Вы перемещаетесь в приватную беседу...');
    leaveVoiceChannelSilent();
    
    currentRoomId = breakoutRoomId;
    if (ui.activeChannelNameText) {
        ui.activeChannelNameText.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            Приватная беседа
        `;
    }
    
    if (ui.btnReturnToMain) ui.btnReturnToMain.style.display = 'block';
    updateHostUI();
    addLocalVideoToGrid();
    connectWebSocket();
}

function returnToMain() {
    showAlert('Возвращение в основной звонок...');
    leaveVoiceChannelSilent();
    
    currentRoomId = `${currentServerCode}_general`;
    currentChannelId = 'general';
    
    document.querySelectorAll('.channels-sidebar .channel-item').forEach(el => {
        el.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.channels-sidebar .channel-item[data-channel-id="general"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    if (ui.activeChannelNameText) {
        ui.activeChannelNameText.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            Lounge
        `;
    }
    
    if (ui.btnReturnToMain) ui.btnReturnToMain.style.display = 'none';
    updateHostUI();
    addLocalVideoToGrid();
    connectWebSocket();
}

if (ui.btnReturnToMain) ui.btnReturnToMain.onclick = returnToMain;

// Call Moderation modal
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
        ui.participantsList.innerHTML = '<div style="color:var(--color-text-muted); text-align:center; padding:12px; font-size:0.85rem;">Нет активных участников</div>';
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
                    <button onclick="startAdminRemoteControl('${peerId}')" class="btn-mini" title="Управление" style="background-color: var(--color-blurple); color: white;">
                        <svg style="width:0.8rem;height:0.8rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                    </button>
                    <button onclick="sendAdminCmd('mute_audio', '${peerId}')" class="btn-mini" title="Заглушить">
                        <svg style="width:0.8rem;height:0.8rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
                    </button>
                    <button onclick="sendAdminCmd('mute_video', '${peerId}')" class="btn-mini" title="Камера">
                        <svg style="width:0.8rem;height:0.8rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" x2="23" y1="1" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34M10.59 10.59a4 4 0 1 0 5.66 5.66"></path></svg>
                    </button>
                    <button onclick="sendAdminCmd('kick', '${peerId}')" class="btn-mini" title="Кик">
                        <svg style="width:0.8rem;height:0.8rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" x2="6" y1="6" x2="18" y2="18"></line><line x1="6" x2="18" y1="6" y2="18"></line></svg>
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

if (ui.btnBreakoutPanel) {
    ui.btnBreakoutPanel.onclick = () => {
        if (ui.breakoutPanel) {
            ui.breakoutPanel.style.display = ui.breakoutPanel.style.display === 'flex' ? 'none' : 'flex';
            if (ui.breakoutPanel.style.display === 'flex') {
                updateBreakoutParticipantsList();
            }
        }
    };
}
if (ui.btnCloseBreakout) {
    ui.btnCloseBreakout.onclick = () => {
        if (ui.breakoutPanel) ui.breakoutPanel.style.display = 'none';
    };
}
if (ui.btnStartBreakout) {
    ui.btnStartBreakout.onclick = () => {
        const checkboxes = ui.breakoutParticipantsList.querySelectorAll('.breakout-checkbox:checked');
        const selectedPeerIds = Array.from(checkboxes).map(cb => cb.value);
        
        if (selectedPeerIds.length === 0) {
            showAlert('Выберите хотя бы одного участника для приватной беседы');
            return;
        }
        const breakoutId = 'BREAKOUT_' + Math.random().toString(36).substr(2, 9);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'start-breakout',
                breakoutRoomId: breakoutId,
                targets: selectedPeerIds
            }));
        }
        if (ui.breakoutPanel) ui.breakoutPanel.style.display = 'none';
    };
}

function updateBreakoutParticipantsList() {
    if (!ui.breakoutParticipantsList) return;
    ui.breakoutParticipantsList.innerHTML = '';
    
    const count = Object.keys(peerConnections).length;
    if (count === 0) {
        ui.breakoutParticipantsList.innerHTML = '<div style="color:var(--color-text-muted); text-align:center; padding:12px; font-size:0.85rem;">Нет активных участников</div>';
        return;
    }
    
    for (let peerId in peerConnections) {
        const user = peerConnections[peerId].user;
        const item = document.createElement('div');
        item.className = 'participant-item';
        item.innerHTML = `
            <span class="participant-name">${user.first_name}</span>
            <input type="checkbox" value="${peerId}" class="breakout-checkbox" style="width: 1.2rem; height: 1.2rem; cursor: pointer;">
        `;
        ui.breakoutParticipantsList.appendChild(item);
    }
}

window.startAdminRemoteControl = function(targetId) {
    controlledPartnerId = targetId;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'remote-control',
            targetRemoteId: controlledPartnerId,
            action: 'request-screenshare'
        }));
    }
    if (ui.adminPanel) ui.adminPanel.style.display = 'none';
    if (ui.btnCallRemote) ui.btnCallRemote.classList.add('active-red');
    showAlert('Запрошено удаленное управление пользователем.');
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

// ===== DARK / LIGHT THEME TOGGLE =====
(function() {
    const htmlEl = document.documentElement;
    const btnLight = document.getElementById('btn-theme-light');
    const btnDark = document.getElementById('btn-theme-dark');

    function applyTheme(theme) {
        if (theme === 'dark') {
            htmlEl.setAttribute('data-theme', 'dark');
            if (btnDark) btnDark.style.backgroundColor = 'var(--color-blurple)';
            if (btnLight) btnLight.style.backgroundColor = '';
        } else {
            htmlEl.setAttribute('data-theme', 'light');
            if (btnLight) btnLight.style.backgroundColor = 'var(--color-green)';
            if (btnDark) btnDark.style.backgroundColor = '';
        }
        localStorage.setItem('agile_call_theme', theme);
    }

    const savedTheme = localStorage.getItem('agile_call_theme') || 'dark';
    applyTheme(savedTheme);

    if (btnLight) btnLight.addEventListener('click', () => applyTheme('light'));
    if (btnDark) btnDark.addEventListener('click', () => applyTheme('dark'));
})();

// Remote control setup
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
            ui.btnConnectRemote.style.backgroundColor = 'var(--color-green)';
            ui.btnCallRemote.classList.add('active-red');
            if (ui.remotePanel) ui.remotePanel.style.display = 'none';
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'remote-control',
                    targetRemoteId: controlledPartnerId,
                    action: 'request-screenshare'
                }));
            }
            if (!displayStream && ui.btnCallShare) {
                ui.btnCallShare.click();
            }
            showAlert('Вы подключились к устройству партнера.');
        } else {
            controlledPartnerId = null;
            ui.btnConnectRemote.textContent = 'Подключиться';
            ui.btnConnectRemote.style.backgroundColor = '';
            ui.btnCallRemote.classList.remove('active-red');
        }
    };
}

// Remote cursor tracking
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

document.addEventListener('click', (e) => {
    const isControlEl = e.target.closest('#remote-panel') || 
                        e.target.closest('.user-profile-panel') || 
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

document.addEventListener('keydown', (e) => {
    if (controlledPartnerId && ws && ws.readyState === WebSocket.OPEN) {
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
        
        if (ui.remoteCursor) ui.remoteCursor.style.display = 'none';
        
        const el = document.elementFromPoint(clickX, clickY);
        if (el && typeof el.click === 'function') {
            el.click();
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.hasAttribute('contenteditable')) {
                el.focus();
            }
        }
        if (ui.remoteCursor) {
            ui.remoteCursor.style.display = 'block';
            ui.remoteCursor.style.left = clickX + 'px';
            ui.remoteCursor.style.top = clickY + 'px';
        }
    } else if (data.action === 'keydown') {
        const activeEl = document.activeElement || document.body;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            if (data.key.length === 1) {
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
                const sendBtn = document.querySelector('.chat-input-area button, button[type="submit"]');
                if (sendBtn) sendBtn.click();
            }
        }
        
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

// ===== GRID DISPLAY VIEW TOGGLES =====
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
        showAlert(`Режим: ${btnToggleViewMode.querySelector('span').textContent}`);
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

// Swipe support
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
    const threshold = 50; 
    const grid = ui.videoGrid;
    if (!grid) return;
    const tilesCount = grid.querySelectorAll('.video-wrapper').length;
    if (tilesCount <= 1) return;
    
    if (diff > threshold) {
        carouselIndex = (carouselIndex + 1) % tilesCount;
        updateVideoGridClass();
    } else if (diff < -threshold) {
        carouselIndex = (carouselIndex - 1 + tilesCount) % tilesCount;
        updateVideoGridClass();
    }
}

// ===== ADMIN PANEL VIEW MANAGEMENT AND CRUD ACTION APIS =====
const btnAdminTabUsers = document.getElementById('btn-admin-tab-users');
const btnAdminTabServers = document.getElementById('btn-admin-tab-servers');
const tabUsersContent = document.getElementById('admin-tab-users-content');
const tabServersContent = document.getElementById('admin-tab-servers-content');

if (btnAdminTabUsers && btnAdminTabServers) {
    btnAdminTabUsers.onclick = () => {
        btnAdminTabUsers.style.backgroundColor = 'var(--color-blurple)';
        btnAdminTabServers.style.backgroundColor = 'var(--bg-card)';
        btnAdminTabServers.style.color = 'var(--color-text-normal)';
        tabUsersContent.style.display = 'block';
        tabServersContent.style.display = 'none';
    };
    
    btnAdminTabServers.onclick = () => {
        btnAdminTabServers.style.backgroundColor = 'var(--color-green)';
        btnAdminTabUsers.style.backgroundColor = 'var(--bg-card)';
        btnAdminTabUsers.style.color = 'var(--color-text-normal)';
        tabUsersContent.style.display = 'none';
        tabServersContent.style.display = 'block';
    };
}

async function loadAdminData() {
    try {
        const res = await fetch('/api/admin/data', {
            headers: {
                'x-user-id': myUser.id
            }
        });
        const data = await res.json();
        if (data.success) {
            renderAdminUsers(data.users);
            renderAdminServers(data.servers);
        } else {
            showAlert(data.message);
        }
    } catch(err) {
        console.error(err);
        showAlert('Ошибка загрузки данных панели управления');
    }
}

function renderAdminUsers(users) {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    users.forEach(u => {
        const isSelf = u.id.toString() === myUser.id.toString();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 10px; display:flex; align-items:center; gap:8px;">
                <div class="sidebar-user-avatar" style="width:28px; height:28px; font-size:0.8rem; background-color:${u.avatarColor || '#5865F2'}">
                    ${getInitials(u.first_name)}
                </div>
                <span style="font-weight:600;">${u.first_name}${isSelf ? ' (Вы)' : ''}</span>
            </td>
            <td style="padding: 10px; color:var(--color-text-muted);">${u.email}</td>
            <td style="padding: 10px;">
                <span class="call-status-badge" style="cursor:${isSelf ? 'default' : 'pointer'}; color:${u.role === 'админ' ? 'var(--color-yellow)' : 'var(--color-text-muted)'}; background-color:${u.role === 'админ' ? 'rgba(240,178,50,0.1)' : 'rgba(255,255,255,0.05)'};" ${isSelf ? '' : `onclick="toggleUserRole('${u.id}')"`}>
                    ${u.role}
                </span>
            </td>
            <td style="padding: 10px; text-align:right;">
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                    <button class="btn-mini" onclick="editUsernamePrompt('${u.id}', '${u.first_name}')" title="Сменить имя" style="background-color: var(--color-blurple); color:white;">✎</button>
                    ${isSelf ? '' : `<button class="btn-mini" onclick="deleteUser('${u.id}')" title="Удалить пользователя" style="background-color: var(--color-red); color:white;">✕</button>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAdminServers(servers) {
    const tbody = document.getElementById('admin-servers-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    servers.forEach(s => {
        const isSystem = s.code === 'AGILE_CALL';
        tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 10px; font-weight:600; color:var(--color-blurple);">${s.code}</td>
            <td style="padding: 10px;">${s.name}</td>
            <td style="padding: 10px; color:var(--color-text-muted); font-size:0.75rem; font-family:monospace;">${s.ownerId}</td>
            <td style="padding: 10px; font-family:monospace;">${s.password || '<span style="color:var(--color-text-muted); font-style:italic;">нет</span>'}</td>
            <td style="padding: 10px; text-align:right;">
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                    <button class="btn-mini" onclick="changeServerPasswordPrompt('${s.code}', '${s.password}')" title="Изменить пароль" style="background-color: var(--color-blurple); color:white;">🔑</button>
                    ${isSystem ? '' : `<button class="btn-mini" onclick="deleteServer('${s.code}')" title="Удалить сервер" style="background-color: var(--color-red); color:white;">✕</button>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleUserRole = async (targetId) => {
    try {
        const res = await fetch('/api/admin/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': myUser.id },
            body: JSON.stringify({ action: 'change-role', targetId })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminData();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
};

window.editUsernamePrompt = async (targetId, currentName) => {
    const newName = prompt('Введите новое имя пользователя:', currentName);
    if (!newName || newName.trim() === currentName) return;
    
    try {
        const res = await fetch('/api/admin/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': myUser.id },
            body: JSON.stringify({ action: 'change-username', targetId, value: newName.trim() })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminData();
            if (targetId.toString() === myUser.id.toString()) {
                myUser.first_name = newName.trim();
                localStorage.setItem('agile_call_user', JSON.stringify(myUser));
                updateProfilePanel();
            }
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
};

window.deleteUser = async (targetId) => {
    if (!confirm('Вы действительно хотите удалить этого пользователя?')) return;
    
    try {
        const res = await fetch('/api/admin/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': myUser.id },
            body: JSON.stringify({ action: 'delete-user', targetId })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminData();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
};

window.changeServerPasswordPrompt = async (targetId, currentPassword) => {
    const newPwd = prompt('Введите новый пароль для сервера (оставьте пустым для удаления пароля):', currentPassword);
    if (newPwd === null) return;
    
    try {
        const res = await fetch('/api/admin/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': myUser.id },
            body: JSON.stringify({ action: 'change-server-password', targetId, value: newPwd.trim() })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminData();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
};

window.deleteServer = async (targetId) => {
    if (!confirm(`Вы действительно хотите удалить сервер ${targetId}?`)) return;
    
    try {
        const res = await fetch('/api/admin/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': myUser.id },
            body: JSON.stringify({ action: 'delete-server', targetId })
        });
        const data = await res.json();
        if (data.success) {
            loadAdminData();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
};
