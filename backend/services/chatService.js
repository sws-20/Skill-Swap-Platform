import { ref, get, push, set, onChildAdded } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, auth } from "../config/firebaseConfig.js";
import { showAlert, linkify, escapeHtml, setText } from "../utils/uiHelpers.js";
import { isConnected } from "./userService.js";

// ================= CHAT SERVICE =================

export function appendMessageToList(msg, currentUid) {
    const list = document.getElementById("messagesList");
    if (!list || !msg) return;

    // Remove empty state if present
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const isSent = msg.from === currentUid;
    const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = isSent ? 'flex-end' : 'flex-start';
    wrapper.className = 'animate-fade-in';

    if (msg.type === 'session') {
        const card = document.createElement('div');
        card.className = 'session-card';
        card.innerHTML = `
            <div class="session-card-header">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span class="text-xs font-bold uppercase tracking-wider">Session Scheduled</span>
            </div>
            <div class="session-card-title">${escapeHtml(msg.title || 'Skill Swap Session')}</div>
            ${msg.time ? `
                <div class="session-card-time">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    ${new Date(msg.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
            ` : ''}
            <a href="${msg.link}" target="_blank" class="session-join-btn">Join Session</a>
        `;
        wrapper.appendChild(card);
    } else {
        const bubble = document.createElement('div');
        bubble.className = isSent ? 'msg-sent' : 'msg-received';
        bubble.innerHTML = linkify(msg.text || '');
        wrapper.appendChild(bubble);
    }

    const meta = document.createElement('div');
    meta.className = 'msg-time';
    meta.style.paddingLeft = isSent ? '0' : '4px';
    meta.style.paddingRight = isSent ? '4px' : '0';
    meta.textContent = time;

    wrapper.appendChild(meta);
    list.appendChild(wrapper);
    list.scrollTop = list.scrollHeight;
}

export function listenToChat(sessionId, currentUid) {
    const list = document.getElementById("messagesList");
    const input = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendMessageBtn");
    const sessionSubmit = document.getElementById("submitSession");

    if (!list) return;

    const messagesRef = ref(database, `chats/${sessionId}/messages`);
    onChildAdded(messagesRef, (snap) => {
        const msg = snap.val();
        appendMessageToList(msg, currentUid);
    });

    // Get other user ID from session
    let otherUserId = null;
    (async () => {
        try {
            const sessionSnap = await get(ref(database, `sessions/${sessionId}`));
            if (sessionSnap.exists()) {
                const sessionData = sessionSnap.val();
                otherUserId = (sessionData.teacher === currentUid) ? sessionData.learner : sessionData.teacher;
            }
        } catch (err) {
            console.error('Error getting session data:', err);
        }
    })();

    const sendMessage = async (payload) => {
        try {
            // ✅ MUTUAL BLOCK CHECK - Prevent messages if either user blocked the other
            if (otherUserId) {
                const { areUsersBlocked } = await import('./userService.js');
                const blocked = await areUsersBlocked(currentUid, otherUserId);
                
                if (blocked) {
                    await showAlert('You cannot send messages to this user.', 'Action Blocked');
                    return false;
                }
            }
            
            const msgRef = push(ref(database, `chats/${sessionId}/messages`));
            await set(msgRef, {
                from: currentUid,
                createdAt: Date.now(),
                ...payload
            });
            return true;
        } catch (e) {
            console.error("Failed to send message", e);
            await showAlert("Failed to send message");
            return false;
        }
    };

    if (sendBtn) {
        sendBtn.onclick = async () => {
            const text = input.value.trim();
            if (!text) return;
            
            // Check if user is temporarily banned
            const userSnap = await get(ref(database, "users/" + currentUid));
            if (userSnap.exists()) {
                const userData = userSnap.val();
                if (userData.isTemporarilyBanned && userData.temporaryBanUntil > Date.now()) {
                    const banEndDate = new Date(userData.temporaryBanUntil);
                    await showAlert(`Your account is temporarily restricted. You cannot send messages until ${banEndDate.toLocaleDateString()}.`);
                    return;
                }
            }
            
            if (await sendMessage({ text })) {
                input.value = '';
            }
        };
        // Also send on Enter
        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendBtn.click();
        };
    }

    if (sessionSubmit) {
        sessionSubmit.onclick = async () => {
            const link = document.getElementById('sessionLink').value.trim();
            const title = document.getElementById('sessionTitle').value.trim();
            const time = document.getElementById('sessionTime').value;

            if (!link) {
                await showAlert("Please provide a meeting link.");
                return;
            }

            sessionSubmit.disabled = true;
            sessionSubmit.textContent = 'Sharing...';

            const success = await sendMessage({
                type: 'session',
                link,
                title,
                time,
                text: `Session Invitation: ${title || 'Meeting'}`
            });

            sessionSubmit.disabled = false;
            sessionSubmit.textContent = 'Create & Share';

            if (success) {
                // Clear and close modal
                document.getElementById('sessionLink').value = '';
                document.getElementById('sessionTitle').value = '';
                document.getElementById('sessionTime').value = '';
                // @ts-ignore
                if (typeof closeModal === 'function') closeModal();
                // Manually trigger closeModal if defined in HTML script
                const overlay = document.getElementById('sessionModalOverlay');
                if (overlay) overlay.click(); // Click overlay to close (as defined in HTML)
            }
        };
    }
}

export async function populateChatHeader(sessionId, currentUid) {
    try {
        const titleEl = document.getElementById("chatTitle");
        if (!titleEl) return;

        const snap = await get(ref(database, `sessions/${sessionId}`));
        if (!snap.exists()) {
            titleEl.textContent = 'Chat';
            return;
        }
        const s = snap.val();

        // Determine other participant
        const otherUid = (s.teacher === currentUid) ? s.learner : s.teacher;

        // Prefer session-stored info
        const name = (otherUid === s.teacher ? (s.teacherName || '') : (s.learnerName || 'Participant')) || 'Participant';
        const email = (otherUid === s.teacher ? (s.teacherEmail || '') : (s.learnerEmail || '')) || '—';

        // If the session didn't store emails (older sessions), try to fetch user record
        let finalEmail = email;
        if ((!finalEmail || finalEmail === '') && otherUid) {
            const otherSnap = await get(ref(database, `users/${otherUid}`));
            if (otherSnap.exists()) {
                const otherData = otherSnap.val();
                const connected = await isConnected(currentUid, otherUid);
                if (connected) finalEmail = otherData.email || '—';
            }
        }

        const initial = name ? name[0].toUpperCase() : '?';
        titleEl.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-[#006064] to-[#FF7F50] flex items-center justify-center font-bold text-white text-sm flex-shrink-0">${initial}</div>
            <div>
              <div class="font-semibold text-white text-base">Chat with ${escapeHtml(name)}</div>
              <div class="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                <span class="online-dot"></span>
                <span>Contact: ${escapeHtml(finalEmail)}</span>
              </div>
            </div>
          </div>
        `;
    } catch (e) {
        console.error('populateChatHeader error', e);
    }
}