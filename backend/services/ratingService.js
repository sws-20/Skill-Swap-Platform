import { ref, get, update, push, set, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, auth } from "../config/firebaseConfig.js";
import { el, showAlert } from "../utils/uiHelpers.js";

// ================= RATING SERVICE =================

// Submit feedback after a session - FIXED VERSION
export async function submitFeedback(sessionId, rating, comment = '', ratedUserId = null, skipAlert = false) {
    console.log('[submitFeedback] Called with:', { sessionId, rating, ratedUserId, commentLength: comment?.length });
    
    if (!sessionId) throw new Error('Session ID is required');

    // VALIDATION: Comment is now REQUIRED
    if (!comment || comment.trim().length < 5) {
        throw new Error('Comment is required (minimum 5 characters)');
    }

    if (!rating || rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
    }

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('You must be logged in');

    console.log(`[submitFeedback] Current user ${currentUser.uid} is rating user ${ratedUserId} with ${rating} stars`);

    try {
        // Check if already rated THIS session
        const feedbackId = `${sessionId}_${currentUser.uid}`;
        const fbRef = ref(database, `feedbacks/${feedbackId}`);
        const fbSnap = await get(fbRef);

        if (fbSnap.exists()) {
            throw new Error('You have already rated this session');
        }

        console.log('[submitFeedback] Saving feedback to Firebase...');

        // SAVE RATING WITH COMMENT (FIXED)
        await set(fbRef, {
            sessionId: sessionId,
            raterId: currentUser.uid,
            ratedUserId: ratedUserId,
            rating: rating,
            comment: comment.trim(),
            createdAt: Date.now()
        });

        console.log('[submitFeedback] ✅ Feedback saved successfully');

        // Update user's average rating
        if (ratedUserId) {
            console.log(`[submitFeedback] About to update rating for user ${ratedUserId}`);
            await updateUserRating(ratedUserId);
            
            // Also log all feedbacks for this user to debug
            const allFeedbacks = await get(ref(database, 'feedbacks'));
            if (allFeedbacks.exists()) {
                const userFeedbacks = [];
                allFeedbacks.forEach(fb => {
                    const val = fb.val();
                    if (val.ratedUserId === ratedUserId) {
                        userFeedbacks.push({ id: fb.key, ...val });
                    }
                });
                console.log(`[submitFeedback] All feedbacks for user ${ratedUserId}:`, userFeedbacks);
            }
        } else {
            console.warn('[submitFeedback] WARNING: ratedUserId is null/undefined, cannot update user rating!');
        }

        // Mark session as completed if both have rated
        await checkSessionCompletion(sessionId);

        if (!skipAlert) {
            await showAlert('Rating submitted successfully!', 'Success');
        }

        console.log('[submitFeedback] ✅ Complete - rating submitted and user stats updated');
        return true;

    } catch (error) {
        console.error('Error submitting feedback:', error);
        throw error;
    }
}

// Check if both users rated and mark session as completed
async function checkSessionCompletion(sessionId) {
    try {
        const sessRef = ref(database, `sessions/${sessionId}`);
        const sessSnap = await get(sessRef);

        if (!sessSnap.exists()) return;

        const session = sessSnap.val();
        const teacherId = session.teacher;
        const learnerId = session.learner;

        // Check if each person has rated
        const teacherFeedback = await get(ref(database, `feedbacks/${sessionId}_${teacherId}`));
        const learnerFeedback = await get(ref(database, `feedbacks/${sessionId}_${learnerId}`));

        const teacherRated = teacherFeedback.exists();
        const learnerRated = learnerFeedback.exists();

        // Always update the rated flags so UI knows who has rated
        const updatePayload = { teacherRated, learnerRated };

        if (teacherRated && learnerRated) {
            // Both rated! Mark as completed so it leaves Active Sessions
            updatePayload.status = 'completed';
            updatePayload.completedAt = Date.now();
            console.log('Session marked as completed - both users rated');
        }

        await update(sessRef, updatePayload);

    } catch (error) {
        console.error('Error checking session completion:', error);
    }
}

// ✅ UPDATED: Calculate and update user rating
async function updateUserRating(userId) {
    try {
        console.log(`[updateUserRating] Starting for user ${userId}`);
        const feedbacksRef = ref(database, 'feedbacks');
        const q = query(feedbacksRef, orderByChild('ratedUserId'), equalTo(userId));
        const snapshot = await get(q);

        if (!snapshot.exists()) {
            console.log(`[updateUserRating] No feedbacks found for user ${userId}, setting to 0`);
            await update(ref(database, "users/" + userId), {
                avgRating: 0,
                totalRatings: 0
            });
            return;
        }

        let total = 0;
        let count = 0;
        snapshot.forEach(child => {
            const val = child.val();
            if (val.rating) {
                total += val.rating;
                count++;
                console.log(`[updateUserRating] Found rating: ${val.rating} from ${val.raterId}`);
            }
        });

        const avg = count > 0 ? (total / count) : 0;
        const rounded = Math.round(avg * 10) / 10;

        console.log(`[updateUserRating] Calculated: ${total} total / ${count} ratings = ${rounded}`);

        // ✅ UPDATE USER WITH NEW AVERAGE RATING
        await update(ref(database, "users/" + userId), {
            avgRating: rounded,
            totalRatings: count,
            sessionsCompleted: count
        });

        console.log(`✅ User ${userId} rating updated: ${rounded}/5 (${count} ratings)`);

    } catch (error) {
        console.error('Error updating user rating:', error);
    }
}

// ================= RATING MODAL UI - COMPLETELY FIXED =================
let ratingModalExists = false;
let currentRatingContext = null;
let ratingModalState = { isSubmitting: false };

export function ensureRatingModal() {
    if (ratingModalExists) return;
    ratingModalExists = true;

    const modalHtml = `
    <div id="ratingOverlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); align-items:center; justify-content:center; z-index:9999;">
      <div class="bg-[#020617] text-gray-200 rounded-lg w-full max-w-md p-6 border border-white/10 relative" style="margin:auto;">
        <button id="ratingCloseBtn" class="absolute right-4 top-4 text-gray-400 text-2xl">✕</button>
        
        <h3 class="text-lg font-semibold mb-2" id="ratingModalTitle">Rate participant</h3>
        <div class="text-sm text-gray-400 mb-4" id="ratingModalSub"></div>

        <!-- STAR RATING -->
        <div class="mb-4">
          <label class="text-sm text-gray-400 block mb-2">Rating (1-5 stars) *</label>
          <div id="starsContainer" class="flex gap-2 text-3xl">
            <span class="star cursor-pointer" data-value="1" style="color:#ddd;">★</span>
            <span class="star cursor-pointer" data-value="2" style="color:#ddd;">★</span>
            <span class="star cursor-pointer" data-value="3" style="color:#ddd;">★</span>
            <span class="star cursor-pointer" data-value="4" style="color:#ddd;">★</span>
            <span class="star cursor-pointer" data-value="5" style="color:#ddd;">★</span>
          </div>
          <p id="selectedRating" class="text-sm text-gray-400 mt-2">No rating selected</p>
        </div>

        <!-- COMMENT FIELD -->
        <div class="mb-4">
          <label for="ratingComment" class="text-sm text-gray-400 block mb-2">Share your feedback (required) *</label>
          <textarea 
            id="ratingComment" 
            rows="4" 
            class="w-full px-3 py-2 rounded-md border border-white/10 bg-[#020617] text-gray-200 focus:border-primary focus:outline-none" 
            placeholder="Tell us about your learning experience (minimum 5 characters)..."
          ></textarea>
          <div class="flex justify-between mt-2">
            <small class="text-gray-400"><span id="charCount">0</span>/500 characters</small>
          </div>
        </div>

        <!-- ERROR MESSAGE -->
        <p id="ratingError" style="color:#ff6b6b; margin:10px 0; font-size:14px; display:none;"></p>

        <!-- SUCCESS MESSAGE -->
        <div id="ratingSuccess" style="background:#2f9e44; color:white; padding:12px; border-radius:6px; margin-bottom:15px; display:none; text-align:center;">
          ✅ Rating submitted successfully! Closing...
        </div>

        <!-- BUTTONS -->
        <div class="flex justify-end gap-3">
          <button id="ratingCancelBtn" class="px-4 py-2 rounded-md border border-white/10 hover:bg-white/5">Cancel</button>
          <button id="ratingSendBtn" class="px-4 py-2 rounded-md bg-primary text-white hover:bg-primary/80">Submit Rating</button>
        </div>
      </div>
    </div>
  `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml.trim();
    const modalEl = wrapper.firstElementChild;
    document.body.insertBefore(modalEl, document.body.firstChild);

    // Inject star filled style
    const style = document.createElement('style');
    style.textContent = '.star.filled { color: #ffc107 !important; }';
    document.head.appendChild(style);

    document.getElementById('ratingCloseBtn').addEventListener('click', closeRatingModal, false);
    document.getElementById('ratingCancelBtn').addEventListener('click', closeRatingModal, false);
    document.getElementById('ratingSendBtn').addEventListener('click', handleRatingSendClick, false);
}

export function openRatingModal(sessionId, ratedUserId, ratedUserName) {
    ensureRatingModal();
    currentRatingContext = { sessionId, ratedUserId, ratedUserName };
    ratingModalState.isSubmitting = false;

    const overlay = document.getElementById('ratingOverlay');
    const title = document.getElementById('ratingModalTitle');
    const comment = document.getElementById('ratingComment');
    const stars = document.querySelectorAll('.star');
    const charCount = document.getElementById('charCount');
    const errorMsg = document.getElementById('ratingError');
    const successMsg = document.getElementById('ratingSuccess');

    // Reset form
    title.textContent = `Rate ${ratedUserName}`;
    comment.value = '';
    charCount.textContent = '0';
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
    successMsg.style.display = 'none';

    let selectedRating = 0;

    // ✅ STAR CLICK HANDLER
    stars.forEach(star => {
        star.onclick = () => {
            selectedRating = parseInt(star.dataset.value);
            document.getElementById('selectedRating').textContent = `Rating: ${selectedRating}/5`;

            // Highlight stars
            stars.forEach(s => {
                if (parseInt(s.dataset.value) <= selectedRating) {
                    s.classList.add('filled');
                } else {
                    s.classList.remove('filled');
                }
            });
        };
    });

    // ✅ CHARACTER COUNTER
    comment.oninput = () => {
        charCount.textContent = comment.value.length;
        if (comment.value.length > 500) {
            comment.value = comment.value.substring(0, 500);
            charCount.textContent = '500';
        }
    };

    // Store selectedRating for submit handler
    overlay.selectedRating = selectedRating;
    overlay.ratingStars = stars;

    overlay.classList.remove('show');  // cleanup just in case
    overlay.style.display = 'flex';
}

export function closeRatingModal() {
    const overlay = document.getElementById('ratingOverlay');
    const comment = document.getElementById('ratingComment');
    const stars = document.querySelectorAll('.star');
    const submitBtn = document.getElementById('ratingSendBtn');
    const successMsg = document.getElementById('ratingSuccess');

    // Reset form
    comment.value = '';
    document.getElementById('charCount').textContent = '0';
    document.getElementById('selectedRating').textContent = 'No rating selected';
    document.getElementById('ratingError').style.display = 'none';
    successMsg.style.display = 'none';

    stars.forEach(s => s.classList.remove('filled'));

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Rating';

    currentRatingContext = null;
    ratingModalState.isSubmitting = false;

    overlay.style.display = 'none';
}

export async function handleRatingSendClick(event) {
    event.preventDefault();
    if (ratingModalState.isSubmitting) return;
    ratingModalState.isSubmitting = true;

    try {
        const comment = document.getElementById('ratingComment');
        const stars = document.querySelectorAll('.star');
        const errorMsg = document.getElementById('ratingError');
        const successMsg = document.getElementById('ratingSuccess');
        const submitBtn = document.getElementById('ratingSendBtn');

        // Get selected rating
        let rating = 0;
        stars.forEach(s => {
            if (s.classList.contains('filled')) {
                rating = Math.max(rating, parseInt(s.dataset.value));
            }
        });

        const comm = comment.value.trim();

        // ✅ VALIDATION
        if (!rating || rating < 1 || rating > 5) {
            errorMsg.textContent = 'Please select a rating (1-5 stars)';
            errorMsg.style.display = 'block';
            ratingModalState.isSubmitting = false;
            return;
        }

        if (!comm || comm.length < 5) {
            errorMsg.textContent = 'Please provide feedback (minimum 5 characters)';
            errorMsg.style.display = 'block';
            ratingModalState.isSubmitting = false;
            return;
        }

        if (!currentRatingContext) {
            errorMsg.textContent = 'Rating context missing. Please try again.';
            errorMsg.style.display = 'block';
            ratingModalState.isSubmitting = false;
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        // ✅ SUBMIT RATING
        await submitFeedback(
            currentRatingContext.sessionId,
            rating,
            comm,
            currentRatingContext.ratedUserId,
            true
        );

        // Wait longer for Firebase to propagate the changes
        await new Promise(resolve => setTimeout(resolve, 1000));

        // ✅ SHOW SUCCESS MESSAGE
        errorMsg.style.display = 'none';
        successMsg.style.display = 'block';
        submitBtn.style.display = 'none';

        // ✅ CLOSE MODAL AFTER 1.5 SECONDS AND REFRESH DASHBOARD
        setTimeout(async () => {
            closeRatingModal();
            submitBtn.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Rating';

            // Refresh the dashboard so rating + sessions update immediately
            try {
                const currentUser = auth.currentUser;
                if (currentUser && window.location.pathname.includes('home.html')) {
                    console.log('[Rating] Attempting to refresh dashboard...');
                    const { populateDashboardFor } = await import('./userService.js');
                    await populateDashboardFor(currentUser.uid, currentUser.email, currentUser);
                    console.log('✅ Dashboard refreshed after rating');
                }
            } catch (e) {
                console.error('Dashboard refresh after rating failed:', e);
                // Force page reload to ensure updated data shows
                console.log('[Rating] Forcing page reload...');
                window.location.reload();
            }
        }, 1500);

    } catch (error) {
        console.error('Error in handleRatingSendClick:', error);
        const errorMsg = document.getElementById('ratingError');
        const submitBtn = document.getElementById('ratingSendBtn');

        errorMsg.textContent = error.message || 'Failed to submit rating. Please try again.';
        errorMsg.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Rating';
    } finally {
        ratingModalState.isSubmitting = false;
    }
}