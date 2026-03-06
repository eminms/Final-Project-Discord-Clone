const API_BASE_URL = "https://localhost:7203/api";

// ==========================================
// 1. AYARLAR & SƏS URL-LƏRİ
// ==========================================
const APP_ID = "068639c00fe6433e9c935d44fa19f778";
const CHANNEL = "Lounge";
const TOKEN = null; // Əgər token istifadə etmirsənsə null qalsın

// Login səhifəsindən gələn adı götürürük
const currentUserName = localStorage.getItem("username") || "Qonaq";

// Səs URL-ləri
const SOUND_JOIN = "https://www.myinstants.com/media/sounds/discord-join.mp3";
const SOUND_LEAVE = "https://www.myinstants.com/media/sounds/discord-leave.mp3";
const SOUND_MUTE = "https://www.myinstants.com/media/sounds/discord-mute.mp3";
const SOUND_UNMUTE = "https://www.myinstants.com/media/sounds/discord-unmute.mp3";
const SOUND_MSG = "https://www.myinstants.com/media/sounds/discord-notification.mp3";
const SOUND_ON = "https://www.myinstants.com/media/sounds/discord-unmute.mp3"; 
const SOUND_OFF = "https://www.myinstants.com/media/sounds/discord-mute.mp3";

// Agora Client Yaradılması (Tək client, ən stabil versiya)
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

// Local Tracks (Səs, Video, Ekran)
let localAudioTrack = null;
let localVideoTrack = null;
let localScreenTrack = null;

// Statuslar
let isMicMuted = false;
let isCamOn = false;
let isScreenSharing = false;

// Səs oynatmaq üçün köməkçi funksiya
function playSound(url) {
    const audio = new Audio(url);
    audio.volume = 0.5;
    audio.play().catch(e => console.log("Audio play error:", e));
}

// Səhifə yüklənəndə istifadəçi məlumatlarını yenilə
document.addEventListener("DOMContentLoaded", () => {
    const nameLabel = document.querySelector('.username');
    if (nameLabel) nameLabel.innerText = currentUserName;

    const userAvatar = document.querySelector('.user-panel .avatar-wrapper img');
    if (userAvatar) {
        userAvatar.src = `https://ui-avatars.com/api/?name=${currentUserName}&background=random`;
    }
});

// ==========================================
// 2. QOŞULMA & ÇIXMA (SESLİ KANAL)
// ==========================================

window.joinChannel = async function () {
    if (localAudioTrack) return; // Artıq qoşulubsa heç nə etmə

    try {
        console.log("Kanala girilir...");
        playSound(SOUND_JOIN);

        // Agora-ya qoşul
        const uid = await client.join(APP_ID, CHANNEL, TOKEN, null);

        // Səsi yaradıb yayınlayırıq
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish([localAudioTrack]);

        // UI Dəyişiklikləri (Sol paneli göstər)
        document.getElementById('voice-connection-panel').style.display = "flex";
        document.getElementById('voice-chat-interface').style.display = "flex";
        document.querySelector('.chat-area').style.display = "none";

        // Kanal düyməsini aktiv rəngə boya
        const channelBtn = document.querySelector('.voice-channel');
        if (channelBtn) {
            channelBtn.style.backgroundColor = "rgba(255,255,255,0.1)";
            channelBtn.style.color = "#fff";
        }

        // Öz kartımızı yaradırıq
        addUserToVoiceUI(currentUserName, true, uid);

    } catch (error) {
        console.error("Qoşulma xətası:", error);
        alert("Xəta: Mikrofona icazə verin!");
    }
};

window.leaveChannel = async function () {
    try {
        playSound(SOUND_LEAVE);

        // Bütün track-ləri bağla (Səs, Video, Ekran)
        if (localAudioTrack) { localAudioTrack.close(); localAudioTrack = null; }
        if (localVideoTrack) { localVideoTrack.close(); localVideoTrack = null; }
        if (localScreenTrack) { localScreenTrack.close(); localScreenTrack = null; }

        await client.leave();

        // UI Bərpa
        document.getElementById('voice-connection-panel').style.display = "none";
        document.getElementById('voice-chat-interface').style.display = "none";
        document.querySelector('.chat-area').style.display = "flex";

        document.getElementById('voice-users-sidebar').innerHTML = '';
        document.getElementById('voice-grid').innerHTML = '';

        const channelBtn = document.querySelector('.voice-channel');
        if (channelBtn) {
            channelBtn.style.backgroundColor = "";
            channelBtn.style.color = "";
        }

        // Dəyişənləri sıfırla
        isMicMuted = false;
        isCamOn = false;
        isScreenSharing = false;
        updateControlsUI();

    } catch (error) {
        console.error("Çıxış xətası:", error);
    }
};

// ==========================================
// 3. MEDIA NƏZARƏT (MİKROFON, KAMERA, EKRAN)
// ==========================================

// --- MİKROFON ---
window.toggleMic = async function () {
    if (!localAudioTrack) {
        console.log("Mikrofon hələ aktiv deyil.");
        return; 
    }

    const isMuted = localAudioTrack.muted;
    await localAudioTrack.setMuted(!isMuted);

    const micBtn = document.getElementById("mic-btn-main");
    const micIcon = micBtn.querySelector("i");
    const sidebarMicIcon = document.getElementById("mic-btn"); 

    if (isMuted) {
        micIcon.classList.remove("fa-microphone-slash");
        micIcon.classList.add("fa-microphone");
        micBtn.style.backgroundColor = ""; 
        micBtn.style.color = "";
        if(sidebarMicIcon) sidebarMicIcon.classList.replace("fa-microphone-slash", "fa-microphone");
    } else {
        micIcon.classList.remove("fa-microphone");
        micIcon.classList.add("fa-microphone-slash");
        if(sidebarMicIcon) sidebarMicIcon.classList.replace("fa-microphone", "fa-microphone-slash");
    }
    isMicMuted = !isMuted;
    updateControlsUI();
};

// --- KAMERA (STABİL VERSİYA) ---
window.toggleCamera = async function () {
    if (!localAudioTrack) { alert("Əvvəlcə kanala qoşulun!"); return; }

    if (!isCamOn) {
        // ƏGƏR EKRAN AÇIQDIRSA, ƏVVƏLCƏ ONU BAĞLA
        if (isScreenSharing) {
            await window.toggleScreen();
        }

        try {
            localVideoTrack = await AgoraRTC.createCameraVideoTrack();
            await client.publish([localVideoTrack]);

            playVideoInCard("local-user", localVideoTrack);
            isCamOn = true;
            playSound(SOUND_ON);

        } catch (e) {
            console.error("Kamera xətası:", e);
            alert("Kameraya icazə verilmədi və ya xəta baş verdi.");
        }
    } else {
        // Kameranı bağla
        if (localVideoTrack) {
            playSound(SOUND_OFF);
            await client.unpublish([localVideoTrack]); // Əvvəlcə yayımı dayandır
            localVideoTrack.close(); // Sonra kameranı bağla
            localVideoTrack = null;
            stopVideoInCard("local-user");
        }
        isCamOn = false;
    }
    updateControlsUI();
};

// --- EKRAN PAYLAŞIMI (STABİL VERSİYA) ---
window.toggleScreen = async function () {
    if (!localAudioTrack) { alert("Əvvəlcə kanala qoşulun!"); return; }

    if (!isScreenSharing) {
        // ƏGƏR KAMERA AÇIQDIRSA, ƏVVƏLCƏ ONU BAĞLA
        if (isCamOn) {
            await window.toggleCamera();
        }

        try {
            // Ekran videosunu alırıq
            let screenResult = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "disable");
            
            // Xəta olmaması üçün array yoxlanışı
            localScreenTrack = Array.isArray(screenResult) ? screenResult[0] : screenResult;

            await client.publish([localScreenTrack]);
            
            // BURA DƏYİŞDİ: Yeni qutu yaratmaq əvəzinə öz qutumuzu böyüdürük
            playVideoInCard("local-user", localScreenTrack);
            
            isScreenSharing = true;
            playSound(SOUND_ON);

            // Brauzerin "Stop Sharing" düyməsi basıldıqda
            localScreenTrack.on("track-ended", () => {
                window.toggleScreen();
            });

        } catch (e) {
            console.error("Ekran xətası:", e);
            if(localScreenTrack) {
                localScreenTrack.close();
                localScreenTrack = null;
            }
        }
    } else {
        // Ekran paylaşımını bağla
        if (localScreenTrack) {
            playSound(SOUND_OFF);
            await client.unpublish([localScreenTrack]); // Əvvəlcə yayımı dayandır
            localScreenTrack.close(); // Sonra track-i bağla
            localScreenTrack = null;
            
            // BURA DƏYİŞDİ: Öz qutumuzu əvvəlki kiçik halına qaytarırıq
            stopVideoInCard("local-user");
        }
        isScreenSharing = false;
    }
    updateControlsUI();
};

// Düymələrin rəngini dəyişən funksiya
function updateControlsUI() {
    const micIconClass = isMicMuted ? "fa-solid fa-microphone-slash" : "fa-solid fa-microphone";
    const mainMicBtn = document.getElementById('mic-btn-main');

    if (mainMicBtn) {
        const icon = mainMicBtn.querySelector('i');
        if (icon) {
            icon.className = micIconClass;
            icon.style.color = isMicMuted ? "black" : "white";
        }
        mainMicBtn.style.backgroundColor = isMicMuted ? "white" : "#2B2D31";
    }

    const camBtn = document.getElementById('cam-btn');
    if (camBtn) {
        camBtn.style.backgroundColor = isCamOn ? "white" : "#2B2D31";
        const icon = camBtn.querySelector('i');
        if (icon) icon.style.color = isCamOn ? "black" : "white";
    }

    const screenBtn = document.getElementById('screen-btn');
    if (screenBtn) {
        screenBtn.style.backgroundColor = isScreenSharing ? "#23a559" : "#2B2D31";
        const icon = screenBtn.querySelector('i');
        if (icon) icon.style.color = "white";
    }
}

// ==========================================
// 4. AGORA HADİSƏLƏRİ (BAŞQALARI GƏLƏNDƏ)
// ==========================================

client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if (mediaType === "audio") {
        user.audioTrack.play();
        playSound(SOUND_JOIN);
        addUserToVoiceUI(`User ${user.uid}`, false, user.uid);
    }

    if (mediaType === "video") {
        addUserToVoiceUI(`User ${user.uid}`, false, user.uid);
        playVideoInCard(`remote-user-${user.uid}`, user.videoTrack);
    }
});

client.on("user-unpublished", (user, mediaType) => {
    if (mediaType === "video") {
        stopVideoInCard(`remote-user-${user.uid}`);
    } else {
        playSound(SOUND_LEAVE);
        removeUserFromVoiceUI(user.uid);
    }
});

// ==========================================
// 5. UI & VİDEO RENDER YARDIMCILARI
// ==========================================

function addUserToVoiceUI(name, isLocal, uid) {
    const voiceUsersSidebar = document.getElementById('voice-users-sidebar');
    const voiceGrid = document.getElementById('voice-grid');
    const elementId = isLocal ? "local-user" : `remote-user-${uid}`;

    if (document.getElementById(`grid-${elementId}`)) return;

    const avatarUrl = `https://ui-avatars.com/api/?name=${name}&background=random`;

    if (voiceUsersSidebar) {
        voiceUsersSidebar.insertAdjacentHTML('beforeend', `
            <div class="voice-user-item" id="sidebar-${elementId}">
                <img src="${avatarUrl}" class="voice-user-avatar">
                <span class="voice-user-name">${name}</span>
            </div>
        `);
    }

    if (voiceGrid) {
        voiceGrid.insertAdjacentHTML('beforeend', `
            <div class="voice-card" id="grid-${elementId}">
                <div class="video-container" id="video-${elementId}"></div>
                <img src="${avatarUrl}" class="voice-card-avatar">
                <span class="voice-card-name">${name}</span>
            </div>
        `);
    }
}

function removeUserFromVoiceUI(uid) {
    const elementId = `remote-user-${uid}`;
    const sidebarItem = document.getElementById(`sidebar-${elementId}`);
    if (sidebarItem) sidebarItem.remove();
    const gridCard = document.getElementById(`grid-${elementId}`);
    if (gridCard) gridCard.remove();
}

function playVideoInCard(elementId, videoTrack) {
    const card = document.getElementById(`grid-${elementId}`);
    const videoContainer = document.getElementById(`video-${elementId}`);

    if (card && videoContainer) {
        card.classList.add('video-active'); 
        videoTrack.play(videoContainer); 
    }
}

function stopVideoInCard(elementId) {
    const card = document.getElementById(`grid-${elementId}`);
    const videoContainer = document.getElementById(`video-${elementId}`);

    if (card && videoContainer) {
        card.classList.remove('video-active'); 
        videoContainer.innerHTML = ''; 
    }
}

// ==========================================
// 6. CHAT & BOT
// ==========================================

const messageInput = document.querySelector('.input-wrapper input');
const messagesContainer = document.querySelector('.messages-container');

if (messageInput) {
    messageInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            const text = messageInput.value;
            if (text.trim() !== "") {
                sendMessage(text);
                messageInput.value = "";
            }
        }
    });
}

function sendMessage(text) {
    const now = new Date();
    const timeString = now.getHours() + ":" + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();

    const messageHTML = `
        <div class="message">
            <div class="message-avatar">
                <img src="https://ui-avatars.com/api/?name=${currentUserName}&background=random" alt="User">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="msg-username">${currentUserName}</span>
                    <span class="msg-time">Bu gün, ${timeString}</span>
                </div>
                <div class="msg-text">${text}</div>
            </div>
        </div>
    `;

    messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (text.toLowerCase().includes('salam')) {
        setTimeout(() => {
            playSound(SOUND_MSG);
            botReply("Salam! Əvvəlki stabil versiyaya qayıtdıq. Yoxlaya bilərsən!");
        }, 1000);
    }
}

function botReply(text) {
    const now = new Date();
    const timeString = now.getHours() + ":" + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();

    const botHTML = `
        <div class="message">
            <div class="message-avatar">
                <img src="https://ui-avatars.com/api/?name=Clyde+Bot&background=7289da&color=fff" alt="Bot">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="msg-username" style="color: #5865F2;">Clyde Bot <span style="background:#5865F2; color:white; font-size:10px; padding:2px 4px; border-radius:3px;">BOT</span></span>
                    <span class="msg-time">Bu gün, ${timeString}</span>
                </div>
                <div class="msg-text">${text}</div>
            </div>
        </div>
    `;

    messagesContainer.insertAdjacentHTML('beforeend', botHTML);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==========================================
// 7. SERVER YARATMA & DƏYİŞDİRMƏ (DÜZƏLDİLDİ!)
// ==========================================

const modal = document.getElementById('server-modal');
const addServerBtn = document.querySelector('.add-icon');
const previewBox = document.getElementById('image-preview');
const fileInput = document.getElementById('server-icon-input');
const nameInput = document.getElementById('server-name-input');
let uploadedImageURL = "";

if (addServerBtn) {
    addServerBtn.onclick = function () {
        modal.style.display = "flex";
        nameInput.value = "";
        previewBox.style.backgroundImage = "none";
        previewBox.innerHTML = '<i class="fa-solid fa-camera"></i>';
        uploadedImageURL = "";
    };
}

window.closeModal = function () {
    modal.style.display = "none";
};

if (previewBox) {
    previewBox.onclick = () => fileInput.click();
}

if (fileInput) {
    fileInput.onchange = function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                uploadedImageURL = e.target.result;
                previewBox.style.backgroundImage = `url(${uploadedImageURL})`;
                previewBox.innerHTML = '';
            };
            reader.readAsDataURL(file);
        }
    };
}

// --- ƏSAS DÜZƏLİŞ BURADADIR ---
window.createNewServer = function () {
    const serverName = nameInput.value;
    if (!serverName) {
        alert("Zəhmət olmasa server adı yazın!");
        return;
    }
    const finalImage = uploadedImageURL || `https://ui-avatars.com/api/?name=${serverName}&background=random`;

    const newServerHTML = `
        <div class="server-wrapper">
            <div class="pill"></div>
            <div class="server-icon" data-name="${serverName}" onclick="switchServer(this)">
                <img src="${finalImage}" alt="Server">
            </div>
        </div>
    `;

    // 1. Sol panelin əsas konteynerini tapırıq
    const serversNav = document.querySelector('.servers-nav'); 
    
    // 2. Add icon-un öz div-ini tapırıq (Bunun üstünə əlavə edəcəyik)
    const addIconWrapper = addServerBtn.closest('.server-wrapper');

    // 3. Əgər addIconWrapper tapıldırsa, yeni serveri ondan ƏVVƏLƏ əlavə edirik
    if (serversNav && addIconWrapper) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newServerHTML.trim();
        const newServerElement = tempDiv.firstChild;
        
        serversNav.insertBefore(newServerElement, addIconWrapper);
    }

    closeModal();
};

window.switchServer = function (element) {
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.pill').forEach(el => el.style.height = "8px");

    element.classList.add('active');
    const pill = element.previousElementSibling;
    if (pill) pill.style.height = "40px";

    const serverTitle = document.getElementById('current-server-name');
    if (serverTitle) serverTitle.innerText = element.getAttribute('data-name');
};

// ==========================================
// 10. AYARLAR MODALI MƏNTİQİ
// ==========================================

const settingsModal = document.getElementById('settings-modal');

async function openSettings() {
    settingsModal.style.display = 'flex';
    
    const currentName = localStorage.getItem("username") || "Qonaq";
    document.getElementById('settings-username-input').value = currentName;
    document.getElementById('settings-username-display').innerText = currentName;
    
    const avatarUrl = `https://ui-avatars.com/api/?name=${currentName}&background=random`;
    document.getElementById('settings-avatar-preview').src = avatarUrl;

    await loadMicrophones();
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

async function loadMicrophones() {
    const select = document.getElementById('mic-select');
    select.innerHTML = '<option value="default">Default Device</option>'; 
    
    try {
        const devices = await AgoraRTC.getDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        audioDevices.forEach(mic => {
            const option = document.createElement('option');
            option.value = mic.deviceId;
            option.text = mic.label || `Microphone ${select.length}`; 
            select.appendChild(option);
        });

    } catch (error) {
        console.error("Cihazlar tapılmadı:", error);
    }
}

function saveSettings() {
    const newName = document.getElementById('settings-username-input').value;
    
    if (newName.trim() !== "") {
        localStorage.setItem("username", newName);
        
        document.getElementById('current-username').innerText = newName;
        document.getElementById('current-user-avatar').src = `https://ui-avatars.com/api/?name=${newName}&background=random`;
        
        alert("Məlumatlar yadda saxlanıldı!");
        closeSettings();
    }
}

window.logout = function() {
    if(confirm("Həqiqətən çıxmaq istəyirsən?")) {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("username");
        window.location.href = "login.html"; 
    }
}

// ==========================================
// EKRAN PAYLAŞIMI ÜÇÜN XÜSUSİ UI FUNKSİYALARI
// ==========================================

function createLocalScreenCard(videoTrack) {
    const grid = document.getElementById('voice-grid');
    const cardId = 'grid-local-screen';
    const videoId = 'video-local-screen';

    if (document.getElementById(cardId)) return;

    const cardHTML = `
        <div class="voice-card video-active" id="${cardId}">
            <div class="video-container" id="${videoId}"></div>
            <span class="voice-card-name">My Screen</span>
        </div>
    `;
    
    grid.insertAdjacentHTML('beforeend', cardHTML);

    const videoContainer = document.getElementById(videoId);
    videoTrack.play(videoContainer);
}

function removeLocalScreenCard() {
     const card = document.getElementById('grid-local-screen');
     if (card) {
         card.remove(); 
     }
}

// ==========================================
// DOSTLAR MENYUSU ÜÇÜN TAB DƏYİŞDİRMƏ VƏ AXTARIŞ
// ==========================================
function switchFriendTab(element, tabName) {
    const tabs = document.querySelectorAll('.friend-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');

    document.getElementById('friends-list-container').style.display = 'none';
    document.getElementById('add-friend-container').style.display = 'none';

    if (tabName === 'add') {
        document.getElementById('add-friend-container').style.display = 'flex';
    } else {
        document.getElementById('friends-list-container').style.display = 'flex';
    }
}

function sendFriendRequestUI() {
    const input = document.getElementById('friend-username-input');
    const msgBox = document.getElementById('add-friend-message');
    const username = input.value.trim();

    if (!username) {
        msgBox.className = 'add-friend-msg error';
        msgBox.innerText = 'Zəhmət olmasa istifadəçi adını yazın!';
        return;
    }

    msgBox.className = 'add-friend-msg success';
    msgBox.innerText = `Uğurlu! "${username}" adlı istifadəçiyə dostluq istəyi göndərildi.`;
    input.value = ''; 
}

document.addEventListener('DOMContentLoaded', () => {
    const addFriendBtn = document.querySelector('.friend-tab.add-friend-btn');
    if(addFriendBtn) {
        switchFriendTab(addFriendBtn, 'add');
    }
});

// ==========================================
// KANAL İDARƏETMƏ (MODALLAR İLƏ)
// ==========================================

let currentChannelType = ''; // 'text' və ya 'voice' olacağını yadda saxlayır
let currentEditingChannel = null; // Üzərində əməliyyat edilən kanalı yadda saxlayır

// Modalları bağlamaq üçün ortaq funksiya
function closeChannelModals() {
    document.getElementById('create-channel-modal').style.display = 'none';
    document.getElementById('edit-channel-modal').style.display = 'none';
}

// 1. + düyməsinə basanda Yarat Modalını açır
function openCreateChannelModal(type) {
    currentChannelType = type;
    document.getElementById('new-channel-name').value = ''; // İçini təmizlə
    document.getElementById('create-channel-modal').style.display = 'flex';
}

// 2. Yarat Modalında "Yarat" düyməsinə basanda
function confirmCreateChannel() {
    const channelName = document.getElementById('new-channel-name').value.trim();
    if (!channelName) {
        alert("Kanal adını yazın!");
        return;
    }

    const listId = currentChannelType === 'text' ? 'text-channels-list' : 'voice-channels-list';
    const listContainer = document.getElementById(listId);
    
    // Mətn və ya Səs kanalına görə ikon və class-ları təyin edirik
    const iconClass = currentChannelType === 'text' ? 'fa-hashtag' : 'fa-volume-high';
    const onClickAttr = currentChannelType === 'voice' ? 'onclick="joinChannel()"' : '';
    const itemClass = currentChannelType === 'voice' ? 'channel-item voice-channel' : 'channel-item';

    const newChannelHTML = `
        <div class="${itemClass}" ${onClickAttr}>
            <div class="channel-name-wrapper">
                <i class="fa-solid ${iconClass}"></i>
                <span>${channelName.toLowerCase()}</span>
            </div>
            <i class="fa-solid fa-gear channel-settings-icon" onclick="event.stopPropagation(); openEditChannelModal(this)"></i>
        </div>
    `;
    
    listContainer.insertAdjacentHTML('beforeend', newChannelHTML);
    closeChannelModals(); // Modalı bağla
}

// 3. ⚙️ (Çarx) düyməsinə basanda Redaktə Modalını açır
function openEditChannelModal(element) {
    currentEditingChannel = element.closest('.channel-item'); // Seçilən kanalı tapır
    const nameSpan = currentEditingChannel.querySelector('.channel-name-wrapper span');
    
    document.getElementById('edit-channel-name').value = nameSpan.innerText; // Köhnə adı inputa yaz
    document.getElementById('edit-channel-modal').style.display = 'flex';
}

// 4. Redaktə Modalında "Yadda Saxla" düyməsinə basanda
function confirmEditChannel() {
    const newName = document.getElementById('edit-channel-name').value.trim();
    if (!newName) {
        alert("Kanal adı boş ola bilməz!");
        return;
    }

    // Yeni adı HTML-ə tətbiq et
    const nameSpan = currentEditingChannel.querySelector('.channel-name-wrapper span');
    nameSpan.innerText = newName.toLowerCase();
    closeChannelModals();
}

// 5. Redaktə Modalında "Kanalı Sil" (Qırmızı) düyməyə basanda
function confirmDeleteChannel() {
    // İstəsən bura confirm() də qoya bilərsən, amma onsuz da qırmızı düymədir deyə birbaşa sildirdim
    currentEditingChannel.remove();
    closeChannelModals();
}