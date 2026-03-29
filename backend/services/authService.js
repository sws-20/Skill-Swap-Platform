import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, set, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { auth, database } from "../config/firebaseConfig.js";
import { isValidLanguage, validateFieldAndShow, isValidEmail, splitSkills } from "../utils/validators.js";
import { showDashboard, hideDashboard, showAlert, setText } from "../utils/uiHelpers.js";

export async function signupUser(event) {
    event.preventDefault();
    console.log('signupUser called');

    const emailEl = document.getElementById("email");
    const passEl = document.getElementById("password");
    const nameEl = document.getElementById("name");
    const offerEl = document.getElementById("offer");
    const learnEl = document.getElementById("learn");
    const message = document.getElementById("signupMessage");

    if (!emailEl || !passEl) {
        console.error('Signup form elements not found.');
        if (message) { message.style.color = "red"; message.textContent = "Form elements missing."; }
        return;
    }

    const email = emailEl.value.trim();
    const password = passEl.value;
    const rawName = nameEl ? nameEl.value.trim() : '';
    const rawOffer = offerEl ? offerEl.value.trim() : '';
    const rawLearn = learnEl ? learnEl.value.trim() : '';

    // Format Name: first letter of each part capitalized, rest lowercase
    const name = rawName.split(' ').map(part => {
        if (!part) return '';
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join(' ');

    // Convert skills to arrays
    const offer = splitSkills(rawOffer);
    const learn = splitSkills(rawLearn);

    // Validate email
    if (!isValidEmail(email)) {
        console.warn('Invalid email provided', email);
        if (message) {
            message.style.color = 'red';
            message.textContent = 'Please use an email from a supported provider (Gmail, Yahoo, Outlook, etc.)';
        }
        emailEl.classList.add('border-red-500');
        return;
    }

    // Validate skills
    if (!isValidLanguage(rawOffer) || !isValidLanguage(rawLearn)) {
        console.warn('Invalid language provided', { offer: rawOffer, learn: rawLearn });
        if (message) {
            message.style.color = 'red';
            message.textContent = 'Please enter at least one skill for both teaching and learning.';
        }
        validateFieldAndShow(offerEl);
        validateFieldAndShow(learnEl);
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Send email verification
        await sendEmailVerification(userCredential.user);

        // Save user data
        await set(ref(database, "users/" + uid), {
            name: name,
            email: email,
            offer: offer,
            learn: learn,
            avgRating: 0,
            totalRatings: 0,
            sessionsCompleted: 0,
            emailVerified: false
        });

        if (message) {
            message.style.color = "green";
            message.innerHTML = `
                ✅ Account created successfully!<br><br>
                📧 We've sent a verification email to <strong>${email}</strong><br><br>
                <span style="color: #fbbf24;">⚠️ Please check your <strong>Spam/Junk folder</strong> if you don't see it in your inbox.</span><br><br>
                Click the link in the email to verify your account, then sign in.
            `;
        }
        console.log('signup success, verification email sent to', email);

        // Sign out so they must verify first
        await signOut(auth);

    } catch (error) {
        console.error('signup error', error);
        if (message) { message.style.color = "red"; message.textContent = error.message || 'Signup failed'; }
    }
}

export function loginUser(event) {
    event.preventDefault();
    console.log('loginUser called');

    const emailEl = document.getElementById("loginEmail");
    const passEl = document.getElementById("loginPassword");
    const message = document.getElementById("loginMessage");

    if (!emailEl || !passEl) {
        console.error('login form elements not found.');
        if (message) { message.style.color = "red"; message.textContent = "Form elements missing."; }
        return;
    }

    const email = emailEl.value.trim();
    const password = passEl.value;

    console.log('Attempting signInWithEmailAndPassword for', email);

    signInWithEmailAndPassword(auth, email, password)
        .then(async (userCredential) => {
            console.log('signIn success', userCredential.user.uid);

            // Check if email is verified
            if (!userCredential.user.emailVerified) {
                console.log('Email not verified yet');
                if (message) {
                    message.style.color = "orange";
                    message.innerHTML = `
                        ⚠️ Please verify your email first.<br><br>
                        Check your inbox at <strong>${email}</strong> for the verification link.<br><br>
                        <span style="color: #fbbf24;">📁 Don't forget to check your <strong>Spam/Junk folder</strong>!</span>
                    `;
                }
                signOut(auth);
                return;
            }

            // Check for bans
            const uid = userCredential.user.uid;
            const userSnap = await get(ref(database, "users/" + uid));
            
            if (userSnap.exists()) {
                const userData = userSnap.val();
                
                // Check permanent ban
                if (userData.isPermanentlyBanned) {
                    if (message) {
                        message.style.color = "red";
                        message.innerHTML = `
                            🚫 Your account has been permanently suspended due to repeated violations.<br><br>
                            If you believe this is a mistake, please contact support.
                        `;
                    }
                    await signOut(auth);
                    return;
                }
                
                // Check temporary ban
                if (userData.isTemporarilyBanned && userData.temporaryBanUntil > Date.now()) {
                    const banEndDate = new Date(userData.temporaryBanUntil);
                    const daysLeft = Math.ceil((userData.temporaryBanUntil - Date.now()) / (1000 * 60 * 60 * 24));
                    if (message) {
                        message.style.color = "orange";
                        message.innerHTML = `
                            ⚠️ Your account is temporarily restricted due to multiple reports.<br><br>
                            Restriction ends: <strong>${banEndDate.toLocaleDateString()}</strong> (${daysLeft} days)<br><br>
                            You can login but cannot send requests or messages.
                        `;
                    }
                    // Allow login but with restrictions
                    setTimeout(() => { window.location.href = "home.html"; }, 3000);
                    return;
                }
                
                // Clear expired temporary ban
                if (userData.isTemporarilyBanned && userData.temporaryBanUntil <= Date.now()) {
                    await update(ref(database, "users/" + uid), { 
                        isTemporarilyBanned: false,
                        temporaryBanUntil: null
                    });
                }
            }

            if (message) { message.style.color = "green"; message.textContent = "Login successful! Redirecting..."; }
            setTimeout(() => { window.location.href = "home.html"; }, 200);
        })
        .catch((error) => {
            console.error('signIn error', error);
            if (message) {
                message.style.color = "red";
                message.textContent = error.message || 'Login failed';
            } else {
                alert(error.message || 'Login failed');
            }
        });
}

export function logout() {
    signOut(auth).then(() => {
        window.location.href = "index.html";
    });
}

// ================= AUTH GUARD =================
let authGuardExecuted = false;

export function initAuthGuard() {
    const protectedPages = ['profile.html', 'home.html', 'browse.html', 'view-requests.html', 'chat.html'];
    const isProtectedPage = protectedPages.some(p => window.location.pathname.includes(p));

    if (!isProtectedPage) return;
    if (authGuardExecuted) return;
    authGuardExecuted = true;

    if (auth.currentUser) {
        console.log("Auth guard: currentUser already available", auth.currentUser.uid);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        if (!user) {
            console.log("Auth guard: User not authenticated, redirecting to index");
            window.location.href = "index.html";
        } else {
            console.log("Auth guard: User authenticated, allowing access", user.uid);
        }
    });
}

// ================= AUTH LISTENER =================
let authListenerRegistered = false;

export function registerAuthListener(callbacks = {}) {
    if (authListenerRegistered) return;
    authListenerRegistered = true;

    onAuthStateChanged(auth, (user) => {
        console.log("Auth listener fired:", user ? user.uid : "logged out");

        if (!user) {
            const protectedPages = ['profile.html', 'home.html', 'browse.html', 'view-requests.html', 'chat.html'];
            if (protectedPages.some(p => window.location.pathname.includes(p))) {
                console.log("Auth listener: Session lost, redirecting to index");
                window.location.href = "index.html";
            }
            return;
        }

        const uid = user.uid;
        const initial = (user.displayName && user.displayName[0]) ? user.displayName[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : 'U');

        const profileAvatar = document.getElementById("profileAvatar");
        const sidebarAvatar = document.getElementById("sidebarAvatar");
        const sidebarAvatarSmall = document.getElementById("sidebarAvatarSmall");
        if (profileAvatar) profileAvatar.textContent = initial;
        if (sidebarAvatar) sidebarAvatar.textContent = initial;
        if (sidebarAvatarSmall) sidebarAvatarSmall.textContent = initial;

        if (window.location.pathname.includes("home.html")) {
            showDashboard();
            if (callbacks.onDashboard) callbacks.onDashboard(uid, user);
        }

        if (window.location.pathname.includes("profile.html")) {
            if (callbacks.onProfile) callbacks.onProfile(uid, user);
        }

        if (window.location.pathname.includes("browse.html")) {
            if (callbacks.onBrowse) callbacks.onBrowse(uid);
        }

        if (window.location.pathname.includes("view-requests.html")) {
            if (callbacks.onRequests) callbacks.onRequests(uid);
        }

        if (window.location.pathname.includes("chat.html")) {
            if (callbacks.onChat) callbacks.onChat(uid);
        }
    });
}