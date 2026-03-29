import { ref, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database } from "../config/firebaseConfig.js";

// =============================================================
//  SkillSwap — ML Ranking Service
//  File: backend/services/mlRankingService.js
//
//  HOW IT WORKS:
//    1. Fetches all feedbacks for each mentor from Firebase
//    2. Sends feedbacks to Python ML API (api_server.py)
//    3. API runs sentiment analysis + Random Forest scoring
//    4. Returns ML score for each mentor
//    5. Browse page shows mentors sorted by ML score
// =============================================================

const ML_API = 'http://localhost:5000';


// -------------------------------------------------------------
// Get all feedbacks for a specific mentor from Firebase
// -------------------------------------------------------------
async function getFeedbacksForUser(userId) {
    try {
        const feedbacksRef = ref(database, 'feedbacks');
        const q = query(feedbacksRef, orderByChild('ratedUserId'), equalTo(userId));
        const snapshot = await get(q);

        const feedbacks = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const val = child.val();
                // Only include feedbacks that have actual comment text
                if (val.comment && val.comment.trim().length > 0) {
                    feedbacks.push(val.comment.trim());
                }
            });
        }
        return feedbacks;
    } catch (err) {
        console.error(`[ML] Error fetching feedbacks for ${userId}:`, err);
        return [];
    }
}


// -------------------------------------------------------------
// Score a single mentor using the ML API
// Sends their feedbacks → gets back ML score + sentiment
// -------------------------------------------------------------
export async function scoreMentor(userId, feedbacks = null) {
    try {
        // If feedbacks not passed in, fetch from Firebase
        const fb = feedbacks ?? await getFeedbacksForUser(userId);

        if (fb.length === 0) return { score: 0, sentiment: null };

        const response = await fetch(`${ML_API}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedbacks: fb })
        });

        if (!response.ok) throw new Error('ML API error');

        const data = await response.json();
        return {
            score:     data.score,      // 1.0 - 5.0
            sentiment: data.sentiment   // { compound, positive, negative, label }
        };

    } catch (err) {
        console.warn('[ML] API unreachable, falling back to avgRating:', err.message);
        return null; // caller will use avgRating fallback
    }
}


// -------------------------------------------------------------
// Rank a full list of mentors using the ML API
// This is called from browse page (userService.js)
// -------------------------------------------------------------
export async function rankMentorsByML(mentors) {
    console.log(`[ML] Ranking ${mentors.length} mentors...`);

    try {
        // Fetch feedbacks for all mentors in parallel
        const mentorsWithFeedbacks = await Promise.all(
            mentors.map(async (mentor) => {
                const feedbacks = await getFeedbacksForUser(mentor.uid);
                return { ...mentor, feedbacks };
            })
        );

        // Send all mentors to /rank-mentors endpoint at once
        const response = await fetch(`${ML_API}/rank-mentors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mentors: mentorsWithFeedbacks.map(m => ({
                    uid:       m.uid,
                    name:      m.name,
                    feedbacks: m.feedbacks
                }))
            })
        });

        if (!response.ok) throw new Error('ML API error');

        const data = await response.json();

        // Merge ML scores back into full mentor objects
        const scoreMap = {};
        data.ranked.forEach(r => {
            scoreMap[r.uid] = { mlScore: r.mlScore, rank: r.rank };
        });

        const rankedMentors = mentorsWithFeedbacks
            .map(mentor => ({
                ...mentor,
                mlScore: scoreMap[mentor.uid]?.mlScore ?? 0,
                rank:    scoreMap[mentor.uid]?.rank    ?? 999
            }))
            .sort((a, b) => b.mlScore - a.mlScore);

        console.log('[ML] ✅ Ranking complete. Top 3:',
            rankedMentors.slice(0, 3).map(m => ({
                name: m.name, mlScore: m.mlScore
            }))
        );

        return rankedMentors;

    } catch (err) {
        // If ML server is not running, fall back to plain avgRating sort
        console.warn('[ML] API unreachable — falling back to avgRating sort:', err.message);
        return mentors.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
    }
}


// -------------------------------------------------------------
// Create ML score badge to show on mentor cards in browse page
// -------------------------------------------------------------
export function createMLScoreBadge(mlScore, sentiment) {
    const badge = document.createElement('div');
    badge.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold mt-2';

    if (mlScore === 0) {
        badge.className += ' bg-gray-500/20 text-gray-400 border border-gray-500/30';
        badge.textContent = '📊 No reviews yet';
        return badge;
    }

    // Color by score range
    if (mlScore >= 4.5) {
        badge.className += ' bg-green-500/20 text-green-400 border border-green-500/30';
        badge.innerHTML = `🏆 ${mlScore} ML Score`;
    } else if (mlScore >= 3.5) {
        badge.className += ' bg-blue-500/20 text-blue-400 border border-blue-500/30';
        badge.innerHTML = `⭐ ${mlScore} ML Score`;
    } else if (mlScore >= 2.5) {
        badge.className += ' bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        badge.innerHTML = `📊 ${mlScore} ML Score`;
    } else {
        badge.className += ' bg-red-500/20 text-red-400 border border-red-500/30';
        badge.innerHTML = `📉 ${mlScore} ML Score`;
    }

    // Show sentiment label if available
    if (sentiment && sentiment.label) {
        const sentBadge = document.createElement('span');
        sentBadge.className = 'ml-1 text-xs text-gray-400';
        sentBadge.textContent = `· ${sentiment.label}`;
        badge.appendChild(sentBadge);
    }

    return badge;
}