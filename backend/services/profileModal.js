import { makeTag, el, escapeHtml, showAlert, showConfirm } from "../utils/uiHelpers.js";
import { splitSkills } from "../utils/validators.js";
import { openRequestModal } from "./requestService.js";

let modalContainer = null;

export function ensureProfileModalContainer() {
    if (modalContainer) return;

    const html = `
    <div id="profileModalOverlay" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] hidden opacity-0 transition-opacity duration-300">
        <div id="profileModalContent" class="bg-[#0f172a] text-gray-200 rounded-2xl w-full max-w-2xl mx-4 relative shadow-2xl border border-white/10 transform scale-95 transition-transform duration-300 overflow-hidden">
            <button id="closeProfileModal" class="absolute right-4 top-4 text-gray-400 hover:text-white z-10 p-2 rounded-full hover:bg-white/10 transition">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            
            <!-- Hero section inside modal -->
            <div class="h-32 bg-gradient-to-r from-primary/30 to-accent/30 relative"></div>
            
            <div class="px-8 pb-8 -mt-12 relative">
                <div class="flex flex-col md:flex-row gap-6 items-start">
                    <div class="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center font-bold text-white text-3xl shadow-xl border-4 border-[#0f172a] overflow-hidden" id="modalAvatar">
                        ?
                    </div>
                    <div class="flex-1 mt-12 md:mt-14">
                        <h2 id="modalName" class="text-3xl font-bold text-white">User Name</h2>
                        <p id="modalBio" class="text-gray-400 mt-2 italic text-lg leading-relaxed">"No bio available yet."</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                    <div class="space-y-4">
                        <h3 class="text-sm font-bold uppercase tracking-wider text-primary">Skills I Can Teach</h3>
                        <div id="modalSkillsTeach" class="flex flex-wrap gap-2"></div>
                    </div>
                    <div class="space-y-4">
                        <h3 class="text-sm font-bold uppercase tracking-wider text-accent">Skills I Want to Learn</h3>
                        <div id="modalSkillsLearn" class="flex flex-wrap gap-2"></div>
                    </div>
                </div>
                
                <div id="modalMatchSection" class="mt-8 p-4 bg-primary/10 rounded-xl border border-primary/20 hidden">
                    <div class="flex items-center gap-3 text-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <span class="font-semibold">Matching Skills:</span>
                        <div id="modalMatchSkills" class="flex flex-wrap gap-2"></div>
                    </div>
                </div>
                
                <div class="flex flex-wrap gap-4 mt-10 pt-6 border-t border-white/5">
                    <button id="modalRequestBtn" class="px-8 py-3 bg-primary hover:bg-primary/80 text-white rounded-xl font-semibold shadow-lg shadow-primary/20 transition-all active:scale-95 flex-1 md:flex-none text-center">
                        Request Session
                    </button>
                    <button id="modalBlockBtn" class="px-4 py-3 text-gray-500 hover:text-amber-400 transition">
                        Block
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;

    modalContainer = el(html);
    document.body.appendChild(modalContainer);

    document.getElementById('closeProfileModal').onclick = closeProfileModal;
    document.getElementById('profileModalOverlay').onclick = (e) => {
        if (e.target.id === 'profileModalOverlay') closeProfileModal();
    };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeProfileModal();
    });
}

export async function openProfileModal(user, currentUid) {
    ensureProfileModalContainer();

    // ✅ MUTUAL BLOCK CHECK - Prevent viewing profile if either user blocked the other
    try {
        const { areUsersBlocked } = await import('./userService.js');
        const blocked = await areUsersBlocked(currentUid, user.uid);
        
        if (blocked) {
            const { showAlert } = await import('../utils/uiHelpers.js');
            await showAlert('You cannot view this profile.', 'Action Blocked');
            return;
        }
    } catch (err) {
        console.error('Error checking block status:', err);
    }

    const overlay = document.getElementById('profileModalOverlay');
    const content = document.getElementById('profileModalContent');
    const nameEl = document.getElementById('modalName');
    const bioEl = document.getElementById('modalBio');
    const avatarEl = document.getElementById('modalAvatar');
    const skillsTeach = document.getElementById('modalSkillsTeach');
    const skillsLearn = document.getElementById('modalSkillsLearn');
    const matchSection = document.getElementById('modalMatchSection');
    const matchSkills = document.getElementById('modalMatchSkills');
    const requestBtn = document.getElementById('modalRequestBtn');
    const blockBtn = document.getElementById('modalBlockBtn');

    nameEl.textContent = user.name || 'User';
    bioEl.textContent = user.bio ? `"${user.bio}"` : '"Passionate about sharing and learning new things!"';
    
    // Display profile photo or initial
    if (user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoURL}" alt="Profile" class="w-full h-full object-cover">`;
    } else {
        avatarEl.textContent = (user.name ? user.name[0] : (user.email ? user.email[0] : '?')).toUpperCase();
    }

    const teachList = splitSkills(user.offer);
    const learnList = splitSkills(user.learn);

    skillsTeach.innerHTML = '';
    teachList.forEach(s => skillsTeach.appendChild(makeTag(s)));
    if (teachList.length === 0) skillsTeach.textContent = 'None';

    skillsLearn.innerHTML = '';
    learnList.forEach(s => skillsLearn.appendChild(makeTag(s)));
    if (learnList.length === 0) skillsLearn.textContent = 'None';

    // Simple matching (if possible to determine current user's skills here, otherwise skip or do basic)
    matchSection.classList.add('hidden');

    requestBtn.onclick = () => {
        closeProfileModal();
        openRequestModal(user);
    };

    // Block button handler
    if (blockBtn) {
        blockBtn.onclick = async () => {
            const confirmed = await showConfirm(
                `You won't see each other in browse anymore.`,
                `Block ${user.name || 'this user'}?`,
                'Yes, Block',
                'Cancel'
            );
            if (!confirmed) return;
            
            console.log('🚫 Block button clicked');
            console.log('Current User:', currentUid);
            console.log('Target User:', user.uid, user.name);
            
            const { blockUser } = await import('./userService.js');
            const success = await blockUser(currentUid, user.uid);
            
            if (success) {
                console.log('✅ Block successful, refreshing UI...');
                await showAlert('User blocked successfully. The page will refresh.', 'Blocked');
                
                // Close modal first
                closeProfileModal();
                
                // Refresh browse page if on browse
                if (window.location.pathname.includes('browse.html')) {
                    console.log('📄 Refreshing browse page...');
                    const { populateBrowsePage } = await import('./userService.js');
                    await populateBrowsePage(currentUid);
                    console.log('✅ Browse page refreshed');
                } else {
                    console.log('ℹ️ Not on browse page, skipping refresh');
                }
            } else {
                console.error('❌ Block failed');
                await showAlert('Failed to block user. Try again.', 'Error');
            }
        };
    }


    // Show modal with animations
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Lock scroll

    // Trigger reflow for animation
    setTimeout(() => {
        overlay.classList.replace('opacity-0', 'opacity-100');
        content.classList.replace('scale-95', 'scale-100');
    }, 10);
}

export function closeProfileModal() {
    const overlay = document.getElementById('profileModalOverlay');
    const content = document.getElementById('profileModalContent');
    if (!overlay) return;

    overlay.classList.replace('opacity-100', 'opacity-0');
    content.classList.replace('scale-100', 'scale-95');

    setTimeout(() => {
        overlay.classList.add('hidden');
        document.body.style.overflow = ''; // Unlock scroll
    }, 300);
}
