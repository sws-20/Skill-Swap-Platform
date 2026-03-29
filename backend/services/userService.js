import { auth, database } from "../config/firebaseConfig.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { setText } from "../utils/uiHelpers.js";

let browseCache = [];

// ================= BROWSE page (WITHOUT JS ML RANKING) =================
export async function populateBrowsePage(currentUid) {
    try {
        const container = document.getElementById("mentorsContainer");
        const searchInput = document.getElementById("searchInput");
        const resultsCount = document.getElementById("resultsCount");

        if (!container) return;

        const user = auth.currentUser;
        if (!user) {
            console.error('User not authenticated');
            container.innerHTML = '<p class="text-red-400">Please log in to browse mentors.</p>';
            return;
        }

        const { createMentorCard, ensureRequestModal } = await import("./requestService.js");

        const usersSnap = await get(ref(database, "users"));
        let mentors = [];
        if (usersSnap.exists()) {
            const users = usersSnap.val();
            mentors = Object.entries(users).map(([uid, data]) => ({
                uid,
                name: data.name,
                email: data.email,
                offer: data.offer || '',
                learn: data.learn || '',
                avgRating: (data.avgRating !== undefined && data.avgRating !== null) ? data.avgRating : 0,
                totalRatings: data.totalRatings || 0,
                sessionsCompleted: data.sessionsCompleted || 0,
                blockedUsers: data.blockedUsers || [],  // ✅ Ensure blockedUsers is always an array
                isTemporarilyBanned: data.isTemporarilyBanned || false,
                temporaryBanUntil: data.temporaryBanUntil || 0,
                isPermanentlyBanned: data.isPermanentlyBanned || false
            }));
        }

        // Get current user's blocked list
        const currentUserSnap = await get(ref(database, "users/" + currentUid));
        const currentUserData = currentUserSnap.exists() ? currentUserSnap.val() : {};
        const blockedUsers = currentUserData.blockedUsers || [];

        console.log('🔍 === BROWSE FILTER DEBUG ===');
        console.log('Current User UID:', currentUid);
        console.log('Current User Blocked List:', blockedUsers);
        console.log('Total mentors before filtering:', mentors.length);

        // Filter out: self, blocked users (both directions), and banned users
        const beforeFilterCount = mentors.length;
        mentors = mentors.filter(m => {
            if (m.uid === currentUid) return false;
            
            // Mutual block check
            const iBlockedThem = blockedUsers.includes(m.uid);
            const theyBlockedMe = (m.blockedUsers || []).includes(currentUid);
            
            if (iBlockedThem) {
                console.log(`🚫 Filtered out ${m.name} (${m.uid}) - I blocked them`);
                return false;
            }
            
            if (theyBlockedMe) {
                console.log(`🚫 Filtered out ${m.name} (${m.uid}) - They blocked me`);
                return false;
            }
            
            // Hide temporarily banned users
            if (m.isTemporarilyBanned && m.temporaryBanUntil > Date.now()) {
                console.log(`🚫 Filtered out ${m.name} (${m.uid}) - Temporarily banned`);
                return false;
            }
            
            // Hide permanently banned users
            if (m.isPermanentlyBanned) {
                console.log(`🚫 Filtered out ${m.name} (${m.uid}) - Permanently banned`);
                return false;
            }
            
            return true;
        });
        
        console.log('Total mentors after filtering:', mentors.length);
        console.log('Filtered out:', beforeFilterCount - mentors.length, 'users');
        console.log('🔍 === FILTER COMPLETE ===');

        // Sort by average rating (simple sorting - NO ML)
        // ML-based ranking using sentiment analysis + Random Forest
        // @ts-ignore
        const { rankMentorsByML } = await import("./mlRankingService.js");
        mentors = await rankMentorsByML(mentors);

        browseCache = mentors;

        async function render(list) {
            container.innerHTML = '';
            if (!list.length) {
                const searchTerm = searchInput ? searchInput.value.trim() : '';
                if (searchTerm) {
                    container.innerHTML = `<p class="text-gray-400 col-span-full">No mentors found matching "${escapeHtml(searchTerm)}"</p>`;
                } else {
                    container.innerHTML = '<p class="text-gray-400 col-span-full">No mentors available.</p>';
                }
                if (resultsCount) resultsCount.textContent = '0';
                return;
            }
            if (resultsCount) resultsCount.textContent = String(list.length);
            for (const m of list) {
                const card = await createMentorCard(m, currentUid);
                container.appendChild(card);
            }
        }
        
        // Helper function to escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        await render(mentors);

        if (searchInput) {
            let debounceTimer;
            
            const doSearch = async () => {
                const q = searchInput.value.trim().toLowerCase();
                if (!q) { 
                    await render(browseCache); 
                    return; 
                }

                const filtered = browseCache.filter(m => {
                    const offerRaw = Array.isArray(m.offer)
                        ? m.offer.join(',')
                        : String(m.offer || '');

                    const skills = offerRaw
                        .toLowerCase()
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean);

                    // ✅ PARTIAL MATCH: Check if any skill contains the search term
                    // Also check bio for additional matching
                    const skillMatch = skills.some(skill => skill.includes(q));
                    const bioMatch = m.bio && String(m.bio).toLowerCase().includes(q);
                    const nameMatch = m.name && String(m.name).toLowerCase().includes(q);
                    
                    return skillMatch || bioMatch || nameMatch;
                });

                await render(filtered);
            };

            // ✅ DEBOUNCED SEARCH: Trigger on every keystroke with 300ms delay
            const debouncedSearch = () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(doSearch, 300);
            };

            searchInput.addEventListener('input', debouncedSearch);
        }

        ensureRequestModal();

    } catch (err) {
        console.error("Error populating browse page:", err);
        const container = document.getElementById("mentorsContainer");
        if (container) container.innerHTML = '<p class="text-red-400">Failed to load mentors.</p>';
    }
}

// ================= DASHBOARD page =================
export async function populateDashboardFor(uid, currentUserEmail, firebaseUser) {
    try {
        const userSnap = await get(ref(database, "users/" + uid));
        let displayName = null;
        if (userSnap.exists()) {
            const data = userSnap.val();
            displayName = data.name || null;
        }
        if (!displayName) {
            displayName = (firebaseUser && firebaseUser.displayName) || (currentUserEmail ? currentUserEmail.split('@')[0] : null) || "User";
        }
        
        // Add "Hey," prefix to the greeting (with comma)
        const greeting = displayName ? `Hey, ${displayName}` : "Hey, User";
        setText("welcomeHeading", greeting);

        // Request counts
        const requestsSnap = await get(ref(database, "requests"));
        let sentCount = 0;
        let receivedCount = 0;
        if (requestsSnap.exists()) {
            const requests = requestsSnap.val();
            Object.values(requests).forEach((r) => {
                if (!r) return;
                if (r.from === uid && r.status === 'pending') sentCount++;
                if (r.to === uid && r.status === 'pending') receivedCount++;
            });
        }
        setText("sentRequestsCount", sentCount);
        setText("receivedRequestsCount", receivedCount);

        // Active Sessions
        const sessionsSnap = await get(ref(database, "sessions"));
        let activeCount = 0;
        const container = document.getElementById("activeSessionsContainer");
        if (container) container.innerHTML = '';

        const { createSessionCard } = await import("./sessionService.js");

        if (sessionsSnap.exists()) {
            const sessions = sessionsSnap.val();
            const sessionList = Object.entries(sessions).map(([id, s]) => ({ id, ...s }));
            const matching = sessionList.filter(s => (s.teacher === uid || s.learner === uid) && (s.status === 'active' || s.status === 'accepted'));
            activeCount = matching.length;
            if (matching.length === 0 && container) {
                container.innerHTML = '<p class="text-gray-400">No active sessions yet.</p>';
            } else {
                for (const s of matching) {
                    s.id = s.id || s.sessionId || s.id;

                    const otherUid = (s.teacher === uid) ? s.learner : s.teacher;

                    const otherName = (s.teacher === uid) ? (s.learnerName || 'Unknown') : (s.teacherName || 'Unknown');
                    const otherEmail = (s.teacher === uid) ? (s.learnerEmail || '') : (s.teacherEmail || '');

                    const otherUser = { uid: otherUid, name: otherName, email: otherEmail };
                    const card = createSessionCard(s, otherUser, uid);
                    container.appendChild(card);
                }
            }
        } else {
            if (container) container.innerHTML = '<p class="text-gray-400">No active sessions yet.</p>';
        }

        setText("activeSessionsCount", activeCount);

        // YOUR rating — recalculate live from feedbacks (source of truth)
        const allFeedbacksSnap = await get(ref(database, "feedbacks"));
        let yourRating = 0;
        let totalRatingsCount = 0;

        if (allFeedbacksSnap.exists()) {
            const allFeedbacks = allFeedbacksSnap.val();
            // Find all feedbacks where this user was rated (by someone else)
            const myFeedbacks = Object.values(allFeedbacks).filter(f =>
                f && f.ratedUserId === uid && f.raterId && f.raterId !== uid
            );
            console.log(`[Dashboard] Found ${myFeedbacks.length} valid feedbacks for uid=${uid}`);
            if (myFeedbacks.length > 0) {
                const sum = myFeedbacks.reduce((acc, f) => acc + (Number(f.rating) || 0), 0);
                yourRating = sum / myFeedbacks.length;
                totalRatingsCount = myFeedbacks.length;
            }
        }

        const yourRatingEl = document.getElementById("rating");
        if (yourRatingEl) {
            if (totalRatingsCount > 0) {
                yourRatingEl.textContent = `${yourRating.toFixed(1)}/5 (${totalRatingsCount})`;
            } else {
                yourRatingEl.textContent = "N/A";
            }
        }

    } catch (err) {
        console.error("Error populating dashboard:", err);
    }
}

// ================= PROFILE page =================
export async function populateProfileFor(uid, user) {
    try {
        const userSnap = await get(ref(database, "users/" + uid));
        if (!userSnap.exists()) {
            console.warn("User data not found in DB for", uid);
            return;
        }

        const data = userSnap.val();
        const nameEl = document.getElementById("profileName");
        const emailEl = document.getElementById("profileEmail");
        const skillsEl = document.getElementById("profileSkills");
        const wantsEl = document.getElementById("profileWants");
        const bioEl = document.getElementById("profileBio");
        const ratingEl = document.getElementById("profileRating");
        const editBio = document.getElementById('editBio');
        const profileAvatar = document.getElementById('profileAvatar');

        // Display profile photo
        if (profileAvatar) {
            if (data.photoURL) {
                profileAvatar.innerHTML = `<img src="${data.photoURL}" alt="Profile" class="w-full h-full object-cover">`;
            } else {
                const initial = (data.name ? data.name[0] : (data.email ? data.email[0] : '?')).toUpperCase();
                profileAvatar.textContent = initial;
            }
        }

        if (nameEl) nameEl.textContent = data.name || 'No Name';
        if (emailEl) emailEl.textContent = data.email || 'No Email';
        const skillsTeach = document.getElementById('skillsTeach');
        const skillsLearn = document.getElementById('skillsLearn');

        const renderSkills = (container, skills) => {
            if (!container) return;
            container.innerHTML = '';
            const list = splitSkills(skills);
            if (list.length === 0) {
                container.textContent = 'None';
            } else {
                list.forEach(s => container.appendChild(makeTag(s)));
            }
        };

        renderSkills(skillsTeach, data.offer);
        renderSkills(skillsLearn, data.learn);
        if (bioEl) bioEl.textContent = data.bio || 'No bio added yet.';

        const avgRating = (data.avgRating !== undefined && data.avgRating !== null) ? data.avgRating : 0;
        const totalRatings = data.totalRatings || 0;

        if (ratingEl) {
            if (totalRatings > 0) {
                ratingEl.textContent = `${avgRating.toFixed(1)}/5 (${totalRatings} reviews)`;
            } else {
                ratingEl.textContent = "No ratings yet";
            }
        }

        // ===== WIRE UP EDIT PROFILE BUTTONS =====
        const editBtn = document.getElementById('editProfileBtn');
        const editForm = document.getElementById('editForm');
        const saveBtn = document.getElementById('saveProfileBtn');
        const cancelBtn = document.getElementById('cancelEditBtn');
        const editMsg = document.getElementById('editMsg');
        const editName = document.getElementById('editName');
        const editOffer = document.getElementById('editOffer');
        const editLearn = document.getElementById('editLearn');

        if (editBtn && editForm) {
            editBtn.addEventListener('click', () => {
                // Pre-fill form with current values
                if (editName) editName.value = data.name || '';
                if (editBio) editBio.value = data.bio || '';
                if (editOffer) editOffer.value = Array.isArray(data.offer) ? data.offer.join(', ') : (data.offer || '');
                if (editLearn) editLearn.value = Array.isArray(data.learn) ? data.learn.join(', ') : (data.learn || '');
                if (editMsg) editMsg.textContent = '';
                
                editForm.classList.remove('hidden');
                editBtn.classList.add('hidden');

                // Smooth scroll to edit form
                editForm.scrollIntoView({ behavior: "smooth" });
            });
        }

        if (cancelBtn && editForm) {
            cancelBtn.addEventListener('click', () => {
                editForm.classList.add('hidden');
                if (editBtn) editBtn.classList.remove('hidden');
                if (editMsg) editMsg.textContent = '';
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const rawName = editName ? editName.value.trim() : data.name;
                const rawBio = editBio ? editBio.value.trim() : (data.bio || '');
                const rawOffer = editOffer ? editOffer.value.trim() : data.offer;
                const rawLearn = editLearn ? editLearn.value.trim() : data.learn;

                if (!rawName) {
                    if (editMsg) { editMsg.style.color = 'red'; editMsg.textContent = 'Name cannot be empty.'; }
                    return;
                }

                // Format Name
                const newName = rawName.split(' ').map(part => {
                    if (!part) return '';
                    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
                }).join(' ');

                // Convert skills to arrays
                const newOffer = splitSkills(rawOffer);
                const newLearn = splitSkills(rawLearn);

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                try {
                    const updates = {
                        name: newName,
                        bio: rawBio,
                        offer: newOffer,
                        learn: newLearn
                    };

                    console.log('Updating profile with:', updates);
                    const success = await updateProfile(uid, updates);

                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';

                    if (success) {
                        // Update visible profile info
                        if (nameEl) nameEl.textContent = newName;
                        if (bioEl) bioEl.textContent = rawBio || 'No bio added yet.';
                        renderSkills(skillsTeach, newOffer);
                        renderSkills(skillsLearn, newLearn);

                        if (editMsg) { editMsg.style.color = 'green'; editMsg.textContent = '✅ Profile updated!'; }

                        setTimeout(() => {
                            if (editForm) editForm.classList.add('hidden');
                            if (editBtn) editBtn.classList.remove('hidden');
                            if (editMsg) editMsg.textContent = '';
                        }, 1500);
                    } else {
                        if (editMsg) { editMsg.style.color = 'red'; editMsg.textContent = 'Failed to save. Try again.'; }
                    }
                } catch (saveError) {
                    console.error('Save profile error:', saveError);
                    if (editMsg) { 
                        editMsg.style.color = 'red'; 
                        editMsg.textContent = saveError.message || 'Failed to save. Try again.'; 
                    }
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                }
            });
        }

        // ===== DELETE ACCOUNT LOGIC =====
        const deleteBtn = document.getElementById('deleteAccountBtn');
        const deleteModal = document.getElementById('deleteModal');
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

        if (deleteBtn && deleteModal) {
            deleteBtn.onclick = () => {
                deleteModal.classList.remove('hidden');
                setTimeout(() => {
                    deleteModal.classList.replace('opacity-0', 'opacity-100');
                    deleteModal.firstElementChild.classList.replace('scale-95', 'scale-100');
                }, 10);
            };
        }

        const closeDeleteModal = () => {
            deleteModal.classList.replace('opacity-100', 'opacity-0');
            deleteModal.firstElementChild.classList.replace('scale-100', 'scale-95');
            setTimeout(() => deleteModal.classList.add('hidden'), 300);
        };

        if (cancelDeleteBtn) cancelDeleteBtn.onclick = closeDeleteModal;

        if (confirmDeleteBtn) {
            confirmDeleteBtn.onclick = async () => {
                confirmDeleteBtn.disabled = true;
                confirmDeleteBtn.textContent = 'Deleting...';

                const res = await deleteAccount();
                if (res.success) {
                    window.location.href = 'index.html';
                } else {
                    confirmDeleteBtn.disabled = false;
                    confirmDeleteBtn.textContent = 'Confirm Delete';
                    alert(res.error || "Failed to delete account.");
                    if (res.reauth) {
                        alert("For security, please log out and log back in before deleting your account.");
                    }
                }
            };
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && deleteModal && !deleteModal.classList.contains('hidden')) {
                closeDeleteModal();
            }
        });
    } catch (err) {
        console.error("Error populating profile:", err);
    }
}

// ================= UPDATE PROFILE =================
export async function updateProfile(uid, updates) {
    try {
        await update(ref(database, "users/" + uid), updates);
        return true;
    } catch (err) {
        console.error("Update profile error:", err);
        return false;
    }
}

// ================= DELETE ACCOUNT =================
/**
 * Deletes the current user's data from Firestore/RTDB and Auth.
 */
export async function deleteAccount() {
    try {
        const user = auth.currentUser;
        if (!user) return { success: false, error: "No user logged in." };
        const uid = user.uid;

        // 1. Delete Firestore/RTDB data
        // We use RTDB based on the imports
        const { remove } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
        await remove(ref(database, "users/" + uid));

        // 2. Storage (if profile picture exists)
        // Check if user has a profile pic in storage
        // Assuming path is "profile_pics/{uid}" based on common patterns
        try {
            const { storage } = await import("../config/firebaseConfig.js");
            const { ref: sRef, deleteObject } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js");
            const picRef = sRef(storage, `profile_pics/${uid}`);
            await deleteObject(picRef).catch(e => console.log("No profile pic to delete or error:", e));
        } catch (storageErr) {
            console.warn("Storage deletion skipped/failed:", storageErr);
        }

        // 3. Delete Auth Account
        const { deleteUser } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
        await deleteUser(user);

        return { success: true };
    } catch (err) {
        console.error("Delete account error:", err);
        if (err.code === 'auth/requires-recent-login') {
            return { success: false, error: "Re-authentication required. Please log out and log back in.", reauth: true };
        }
        return { success: false, error: err.message };
    }
}

// ================= IS CONNECTED =================
export async function isConnected(uid1, uid2) {
    try {
        const sessionsSnap = await get(ref(database, "sessions"));
        if (!sessionsSnap.exists()) return false;
        const sessions = sessionsSnap.val();
        return Object.values(sessions).some(s =>
            s && (
                (s.teacher === uid1 && s.learner === uid2) ||
                (s.teacher === uid2 && s.learner === uid1)
            )
        );
    } catch (err) {
        console.error("isConnected error:", err);
        return false;
    }
}

// ================= BLOCK USER =================
export async function blockUser(currentUid, targetUid) {
    try {
        console.log('🚫 === BLOCK USER DEBUG ===');
        console.log('Current User UID:', currentUid);
        console.log('Target User UID:', targetUid);
        
        const userSnap = await get(ref(database, "users/" + currentUid));
        if (!userSnap.exists()) {
            console.error('❌ Current user not found in database');
            return false;
        }
        
        const userData = userSnap.val();
        const blockedUsers = userData.blockedUsers || [];
        
        console.log('📋 Current blocked list BEFORE:', blockedUsers);
        
        if (!blockedUsers.includes(targetUid)) {
            blockedUsers.push(targetUid);
            
            console.log('⬆️ Updating database with new blocked list:', blockedUsers);
            await update(ref(database, "users/" + currentUid), { blockedUsers });
            
            // Verify the update was successful
            const verifySnap = await get(ref(database, "users/" + currentUid));
            if (verifySnap.exists()) {
                const verifiedData = verifySnap.val();
                console.log('✅ Verified blocked list AFTER update:', verifiedData.blockedUsers);
                
                if (verifiedData.blockedUsers && verifiedData.blockedUsers.includes(targetUid)) {
                    console.log('✅ Block saved successfully!');
                } else {
                    console.error('❌ Block save verification FAILED!');
                    return false;
                }
            }
        } else {
            console.log('ℹ️ User already blocked');
        }
        
        console.log('🚫 === BLOCK COMPLETE ===');
        return true;
    } catch (err) {
        console.error("❌ Block user error:", err);
        console.error("Error details:", {
            code: err.code,
            message: err.message
        });
        return false;
    }
}

// ================= CHECK IF USERS ARE MUTUALLY BLOCKED =================
/**
 * Check if two users have blocked each other (bidirectional check)
 * @param {string} uid1 - First user ID
 * @param {string} uid2 - Second user ID
 * @returns {Promise<boolean>} - True if either user blocked the other
 */
export async function areUsersBlocked(uid1, uid2) {
    try {
        // Get both users' data
        const user1Snap = await get(ref(database, "users/" + uid1));
        const user2Snap = await get(ref(database, "users/" + uid2));
        
        if (!user1Snap.exists() || !user2Snap.exists()) {
            return false;
        }
        
        const user1Data = user1Snap.val();
        const user2Data = user2Snap.val();
        
        const user1Blocked = user1Data.blockedUsers || [];
        const user2Blocked = user2Data.blockedUsers || [];
        
        // Check both directions
        const user1BlockedUser2 = user1Blocked.includes(uid2);
        const user2BlockedUser1 = user2Blocked.includes(uid1);
        
        return user1BlockedUser2 || user2BlockedUser1;
    } catch (err) {
        console.error("Check blocked users error:", err);
        return false;
    }
}

