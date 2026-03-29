import { ref, get, update, push, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, auth } from "../config/firebaseConfig.js";
import { setText, makeTag, el, escapeHtml, showAlert, showConfirm } from "../utils/uiHelpers.js";
import { splitSkills } from "../utils/validators.js";

// ================= REQUEST MODAL =================
let requestModalExists = false;
let currentModalMentor = null;
let requestModalState = { isSubmitting: false };

export function ensureRequestModal() {
    if (requestModalExists) return;
    requestModalExists = true;

    const modalHtml = `
    <div id="requestOverlay" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 hidden">
      <div class="bg-[#020617] text-gray-200 rounded-lg w-full max-w-lg p-6 border border-white/10 relative">
        <button id="requestCloseBtn" class="absolute right-4 top-4 text-gray-400">✕</button>
        <h3 class="text-lg font-semibold mb-4" id="requestModalTitle">Send Learning Request</h3>

        <label class="text-sm text-gray-400">Skill to Learn *</label>
        <input id="requestSkillInput" class="w-full px-3 py-2 rounded-md border border-white/10 mt-1 mb-3 bg-[#020617] text-gray-200" placeholder="e.g. Python Programming" />

        <label class="text-sm text-gray-400">Message *</label>
        <textarea id="requestMessageInput" rows="5" class="w-full px-3 py-2 rounded-md border border-white/10 mt-1 mb-4 bg-[#020617] text-gray-200" placeholder="Tell them why you want to learn this skill..."></textarea>

        <div class="flex justify-end gap-3">
          <button id="requestCancelBtn" class="px-4 py-2 rounded-md border border-white/10">Cancel</button>
          <button id="requestSendBtn" class="px-4 py-2 rounded-md bg-black text-white">Send Request</button>
        </div>
      </div>
    </div>
  `;
    document.body.insertBefore(el(modalHtml), document.body.firstChild);

    document.getElementById('requestCloseBtn').addEventListener('click', closeRequestModal, false);
    document.getElementById('requestCancelBtn').addEventListener('click', closeRequestModal, false);

    const sendBtn = document.getElementById('requestSendBtn');
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', handleRequestSendClick, false);
}

export function openRequestModal(mentor) {
    ensureRequestModal();
    currentModalMentor = mentor;
    requestModalState.isSubmitting = false;

    const overlay = document.getElementById('requestOverlay');
    const title = document.getElementById('requestModalTitle');
    const skillInput = document.getElementById('requestSkillInput');
    const msgInput = document.getElementById('requestMessageInput');

    title.textContent = `Send Learning Request to ${mentor.name || mentor.email || 'mentor'}`;
    skillInput.value = '';
    msgInput.value = '';

    const offers = splitSkills(mentor.offer);
    if (offers.length === 1) {
        skillInput.value = offers[0];
    }

    if (!skillInput.value) {
        skillInput.placeholder = offers.length ? offers.join(', ') : 'e.g. Graphic Design';
    }

    overlay.classList.remove('hidden');
}

export function closeRequestModal() {
    const overlay = document.getElementById('requestOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');

    const skillInput = document.getElementById('requestSkillInput');
    const msgInput = document.getElementById('requestMessageInput');
    if (skillInput) skillInput.value = '';
    if (msgInput) msgInput.value = '';

    currentModalMentor = null;
    requestModalState.isSubmitting = false;
}

export async function handleRequestSendClick(event) {
    event.preventDefault();
    if (requestModalState.isSubmitting) return;

    requestModalState.isSubmitting = true;

    try {
        const skillInput = document.getElementById('requestSkillInput');
        const msgInput = document.getElementById('requestMessageInput');

        const skill = skillInput.value.trim();
        const note = msgInput.value.trim();

        if (!skill) {
            await showAlert('Please enter the skill you want to learn.', 'Missing skill');
            requestModalState.isSubmitting = false;
            return;
        }

        if (!note) {
            const ok = await showConfirm('Send without a message?', 'No message provided', 'Send', 'Cancel');
            if (!ok) {
                requestModalState.isSubmitting = false;
                return;
            }
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            await showAlert('Not authenticated.');
            closeRequestModal();
            requestModalState.isSubmitting = false;
            return;
        }

        // Check if user is temporarily banned
        const userSnap = await get(ref(database, "users/" + currentUser.uid));
        if (userSnap.exists()) {
            const userData = userSnap.val();
            if (userData.isTemporarilyBanned && userData.temporaryBanUntil > Date.now()) {
                const banEndDate = new Date(userData.temporaryBanUntil);
                await showAlert(`Your account is temporarily restricted. You cannot send requests until ${banEndDate.toLocaleDateString()}.`, 'Account Restricted');
                closeRequestModal();
                requestModalState.isSubmitting = false;
                return;
            }
        }

        if (!currentModalMentor) {
            await showAlert('Mentor information missing.');
            requestModalState.isSubmitting = false;
            return;
        }

        // ✅ MUTUAL BLOCK CHECK - Prevent requests if either user blocked the other
        const currentUserData = userSnap.exists() ? userSnap.val() : {};
        const currentUserBlocked = currentUserData.blockedUsers || [];
        
        // Get target user data to check if they blocked current user
        const targetUserSnap = await get(ref(database, "users/" + currentModalMentor.uid));
        const targetUserData = targetUserSnap.exists() ? targetUserSnap.val() : {};
        const targetUserBlocked = targetUserData.blockedUsers || [];
        
        // Check both directions
        if (currentUserBlocked.includes(currentModalMentor.uid)) {
            await showAlert('You cannot send requests to this user.', 'Action Blocked');
            closeRequestModal();
            requestModalState.isSubmitting = false;
            return;
        }
        
        if (targetUserBlocked.includes(currentUser.uid)) {
            await showAlert('You cannot interact with this user.', 'Action Blocked');
            closeRequestModal();
            requestModalState.isSubmitting = false;
            return;
        }

        const reqRef = push(ref(database, "requests"));
        await set(reqRef, {
            from: currentUser.uid,
            to: currentModalMentor.uid,
            skill: skill,
            note: note,
            status: "pending",
            createdAt: Date.now()
        });

        closeRequestModal();
        await showAlert('Request sent successfully!', 'Success');

        try {
            const { populateRequestsPage } = await import('./requestService.js');
            const { populateDashboardFor, populateBrowsePage } = await import('./userService.js');
            if (window.location.pathname.includes('view-requests.html')) {
                await populateRequestsPage(currentUser.uid);
            }
            if (window.location.pathname.includes('home.html')) {
                await populateDashboardFor(currentUser.uid, currentUser.email, currentUser);
            }
            if (window.location.pathname.includes('browse.html')) {
                await populateBrowsePage(currentUser.uid);
            }
        } catch (refreshErr) {
            console.warn('Backend refresh warning:', refreshErr);
        }

    } catch (err) {
        console.error('Error in handleRequestSendClick:', err);
        await showAlert('Failed to send request. Please try again.', 'Error');
    } finally {
        requestModalState.isSubmitting = false;
    }
}

// ================= REQUESTS PAGE =================

export async function populateRequestsPage(currentUid) {
    try {
        const receivedContainer = document.getElementById("receivedRequests");
        const sentContainer = document.getElementById("sentRequests");
        const receivedBadge = document.getElementById("receivedCountBadge");
        const sentBadge = document.getElementById("sentCountBadge");
        const emptyTemplate = document.getElementById("emptyStateTemplate");

        if (receivedContainer) receivedContainer.innerHTML = '<p class="text-gray-400 col-span-full">Loading…</p>';
        if (sentContainer) sentContainer.innerHTML = '<p class="text-gray-400 col-span-full">Loading…</p>';

        const requestsSnap = await get(ref(database, "requests"));
        let requests = [];
        if (requestsSnap.exists()) requests = Object.entries(requestsSnap.val()).map(([id, r]) => ({ id, ...r }));

        const received = requests.filter(r => r.to === currentUid && r.status !== 'canceled').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const sent = requests.filter(r => r.from === currentUid && r.status !== 'canceled').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (receivedBadge) receivedBadge.textContent = received.length;
        if (sentBadge) sentBadge.textContent = sent.length;

        const { openProfileModal } = await import('./profileModal.js');

        const renderEmpty = (container, title, desc) => {
            container.innerHTML = '';
            const clone = emptyTemplate.cloneNode(true);
            clone.classList.remove('hidden');
            clone.querySelector('#emptyTitle').textContent = title;
            clone.querySelector('#emptyDesc').textContent = desc;
            container.appendChild(clone);
        };

        const createRequestCard = async (r, type) => {
            const isReceived = type === 'received';
            const otherUid = isReceived ? r.from : r.to;
            const userSnap = await get(ref(database, "users/" + otherUid));
            const user = userSnap.exists() ? userSnap.val() : { name: 'Unknown', email: '—' };
            user.uid = otherUid;

            const card = document.createElement('div');
            card.className = 'request-card rounded-2xl p-6 flex flex-col gap-4 relative animate-fade-in';

            const statusColors = {
                pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                accepted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                rejected: 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            };
            const statusColor = statusColors[r.status] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';

            const skills = splitSkills(user.offer);
            const skillTags = skills.slice(0, 3).map(s => `<span class="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[10px] uppercase tracking-wider font-bold text-gray-400">${escapeHtml(s)}</span>`).join('');

            // Avatar with photo support
            let avatarContent;
            if (user.photoURL) {
                avatarContent = `<img src="${user.photoURL}" alt="Profile" class="w-full h-full object-cover">`;
            } else {
                const initial = (user.name ? user.name[0] : (user.email ? user.email[0] : '?')).toUpperCase();
                avatarContent = initial;
            }

            card.innerHTML = `
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center font-bold text-white text-lg border border-white/10 overflow-hidden">
                            ${avatarContent}
                        </div>
                        <div>
                            <div class="font-bold text-white text-lg leading-tight">${escapeHtml(user.name || 'User')}</div>
                            <div class="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-primary/40"></span>
                                Wants to learn: <span class="text-gray-300 font-medium">${escapeHtml(r.skill || '—')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${statusColor}">
                        ${escapeHtml(r.status)}
                    </div>
                </div>

                <div class="p-4 bg-white/5 border border-white/5 rounded-xl">
                    <p class="text-sm text-gray-400 italic line-clamp-2">"${r.note ? escapeHtml(r.note) : 'No message provided.'}"</p>
                </div>

                <div class="flex items-center gap-2 mt-2">
                    ${skillTags}
                    ${skills.length > 3 ? `<span class="text-[10px] text-gray-500">+${skills.length - 3} more</span>` : ''}
                </div>

                <div class="flex items-center gap-3 mt-4 pt-4 border-t border-white/5">
                    ${isReceived && r.status === 'pending' ? `
                        <button class="acceptBtn px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-all active:scale-95 flex-1" data-id="${r.id}">Accept</button>
                        <button class="rejectBtn px-4 py-2 bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-500 border border-white/10 rounded-lg text-sm font-bold transition-all active:scale-95 flex-1" data-id="${r.id}">Reject</button>
                    ` : ''}
                    ${!isReceived && r.status === 'pending' ? `
                        <button class="cancelBtn px-4 py-2 bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-500 border border-white/10 rounded-lg text-sm font-bold transition-all active:scale-95 flex-1" data-id="${r.id}">Cancel Request</button>
                    ` : ''}
                    ${r.status === 'accepted' && r.sessionId ? `
                        <a class="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-bold transition-all active:scale-95 flex-1 text-center" href="chat.html?sessionId=${r.sessionId}">Open Chat</a>
                    ` : ''}
                    <button class="profileBtn px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg text-sm font-bold transition-all hover:bg-white/10 active:scale-95 flex-1">View Profile</button>
                </div>
            `;

            card.querySelector('.profileBtn').onclick = () => openProfileModal(user, currentUid);

            if (card.querySelector('.acceptBtn')) {
                card.querySelector('.acceptBtn').onclick = () => handleAccept(r.id);
            }
            if (card.querySelector('.rejectBtn')) {
                card.querySelector('.rejectBtn').onclick = () => handleReject(r.id);
            }
            if (card.querySelector('.cancelBtn')) {
                card.querySelector('.cancelBtn').onclick = () => handleCancel(r.id);
            }

            return card;
        };

        const handleAccept = async (id) => {
            const ok = await showConfirm('Accept this request and start a session?', 'Accept request', 'Accept', 'Cancel');
            if (!ok) return;
            try {
                const requestSnap = await get(ref(database, "requests/" + id));
                const r = requestSnap.val();
                const teacherUid = r.to;
                const learnerUid = r.from;
                const [teacherSnap, learnerSnap] = await Promise.all([
                    get(ref(database, `users/${teacherUid}`)),
                    get(ref(database, `users/${learnerUid}`))
                ]);
                const teacherData = teacherSnap.exists() ? teacherSnap.val() : {};
                const learnerData = learnerSnap.exists() ? learnerSnap.val() : {};

                const sessRef = push(ref(database, "sessions"));
                await set(sessRef, {
                    teacher: teacherUid, learner: learnerUid, skill: r.skill || '', status: 'active',
                    createdAt: Date.now(), teacherName: teacherData.name || '', teacherEmail: teacherData.email || '',
                    learnerName: learnerData.name || '', learnerEmail: learnerData.email || '',
                    teacherRated: false, learnerRated: false
                });

                await update(ref(database, "requests/" + id), { status: 'accepted', acceptedAt: Date.now(), sessionId: sessRef.key });
                await showAlert('Request accepted. Session created.', 'Accepted');
                populateRequestsPage(currentUid);
            } catch (err) { console.error(err); await showAlert('Failed to accept request.'); }
        };

        const handleReject = async (id) => {
            const ok = await showConfirm('Reject this request?', 'Reject request', 'Reject', 'Cancel');
            if (!ok) return;
            try {
                await update(ref(database, "requests/" + id), { status: 'rejected', respondedAt: Date.now() });
                await showAlert('Request rejected.', 'Rejected');
                populateRequestsPage(currentUid);
            } catch (err) { console.error(err); await showAlert('Failed to reject request.'); }
        };

        const handleCancel = async (id) => {
            const ok = await showConfirm('Do you really want to cancel this request?', 'Cancel request', 'Yes, cancel', 'Keep');
            if (!ok) return;
            try {
                await update(ref(database, `requests/${id}`), { status: 'canceled', canceledAt: Date.now() });
                await showAlert('Request canceled.', 'Canceled');
                populateRequestsPage(currentUid);
            } catch (err) { console.error(err); await showAlert('Failed to cancel request.'); }
        };

        if (receivedContainer) {
            receivedContainer.innerHTML = '';
            if (received.length === 0) {
                renderEmpty(receivedContainer, "No Received Requests", "When someone connects with you, it will appear here.");
            } else {
                for (const r of received) {
                    receivedContainer.appendChild(await createRequestCard(r, 'received'));
                }
            }
        }

        if (sentContainer) {
            sentContainer.innerHTML = '';
            if (sent.length === 0) {
                renderEmpty(sentContainer, "No Sent Requests", "Start browsing skills to find a mentor!");
            } else {
                for (const r of sent) {
                    sentContainer.appendChild(await createRequestCard(r, 'sent'));
                }
            }
        }

    } catch (err) {
        console.error("Error populating requests page:", err);
    }
}

// ================= MENTOR CARD =================
export async function createMentorCard(mentor, currentUid) {
    const card = document.createElement('div');
    card.className = "bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start hover:scale-[1.02] transition-transform duration-300 cursor-pointer";

    // Add click event for profile modal
    card.onclick = async (e) => {
        // Don't open if clicking a button
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        const { openProfileModal } = await import('./profileModal.js');
        openProfileModal(mentor, currentUid);
    };

    const left = document.createElement('div');
    left.className = "flex-1";

    const name = document.createElement('div');
    name.className = "font-semibold text-lg";
    name.textContent = mentor.name || 'Unnamed';

    const email = document.createElement('div');
    email.className = "text-gray-400 text-sm mt-1";
    email.textContent = 'Email: —';

    const meta = document.createElement('div');
    meta.className = "text-sm text-gray-400 mt-2";
    const avgRating = (mentor.avgRating !== undefined && mentor.avgRating !== null) ? mentor.avgRating : 0;
    const totalRatings = mentor.totalRatings || 0;
    meta.textContent = `Rating: ${avgRating > 0 ? avgRating.toFixed(1) : 'N/A'} · Sessions: ${totalRatings}`;

    const teachDiv = document.createElement('div');
    teachDiv.className = "flex flex-wrap gap-2 mt-3";
    const offerList = splitSkills(mentor.offer);
    if (offerList.length === 0) {
        const p = document.createElement('div');
        p.className = 'text-gray-400 text-sm';
        p.textContent = 'No skills offered';
        teachDiv.appendChild(p);
    } else {
        offerList.forEach(s => {
            teachDiv.appendChild(makeTag(s));
        });
    }

    const learnDiv = document.createElement('div');
    learnDiv.className = "mt-3 text-sm text-gray-400";
    const learnList = splitSkills(mentor.learn);
    learnDiv.textContent = 'Wants to learn: ' + (learnList.length ? learnList.join(', ') : '—');

    left.appendChild(name);
    left.appendChild(email);
    left.appendChild(meta);
    // ML score badge
    if (mentor.mlScore && mentor.mlScore > 0) {
        // @ts-ignore
        const { createMLScoreBadge } = await import("./mlRankingService.js");
        const badge = createMLScoreBadge(mentor.mlScore, mentor.sentiment || null);
        left.appendChild(badge);
    }
    left.appendChild(teachDiv);
    left.appendChild(learnDiv);

    const right = document.createElement('div');
    right.className = "mt-4 md:mt-0 md:ml-6 flex flex-col gap-2";

    const viewBtn = document.createElement('button');
    viewBtn.className = "px-4 py-2 border border-white/20 rounded-md text-sm text-center hover:bg-white/10 transition";
    viewBtn.textContent = 'View Profile';
    viewBtn.onclick = async () => {
        const { openProfileModal } = await import('./profileModal.js');
        openProfileModal(mentor, currentUid);
    };
    right.appendChild(viewBtn);

    const requestBtn = document.createElement('button');
    requestBtn.className = "px-4 py-2 bg-primary rounded-md text-white hover:bg-primary/80 transition";
    requestBtn.textContent = 'Request';
    requestBtn.onclick = (e) => {
        e.stopPropagation();
        openRequestModal(mentor);
    };
    right.appendChild(requestBtn);

    card.appendChild(left);
    card.appendChild(right);
    return card;
}