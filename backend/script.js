// ================= FIREBASE & MODULE IMPORTS =================
import { auth, storage, database } from "./config/firebaseConfig.js";

// Import Services (CORRECTED PATHS)
import * as AuthService from "./services/authService.js";
import * as UserService from "./services/userService.js";
import * as RatingService from "./services/ratingService.js";
import * as RequestService from "./services/requestService.js";
import * as ChatService from "./services/chatService.js";
import * as SessionService from "./services/sessionService.js";

// Import Utils
import * as UI from "./utils/uiHelpers.js";
import * as Validators from "./utils/validators.js";

// ================= EXPORT TO WINDOW =================
// Make functions available globally for onclick handlers
window.auth = auth;
window.storage = storage;
window.database = database;

// Auth Functions
window.signupUser = AuthService.signupUser;
window.loginUser = AuthService.loginUser;
window.logout = AuthService.logout;
window.initAuthGuard = AuthService.initAuthGuard;
window.registerAuthListener = AuthService.registerAuthListener;

// Validators
window.attachLanguageValidationToField = Validators.attachLanguageValidationToField;
window.splitSkills = Validators.splitSkills;

// UI Functions
window.showDashboard = UI.showDashboard;
window.hideDashboard = UI.hideDashboard;
window.showAlert = UI.showAlert;
window.showConfirm = UI.showConfirm;
window.makeTag = UI.makeTag;
window.setText = UI.setText;
window.el = UI.el;
window.escapeHtml = UI.escapeHtml;
window.linkify = UI.linkify;

// User Service Functions
window.populateDashboardFor = UserService.populateDashboardFor;
window.populateProfileFor = UserService.populateProfileFor;
window.populateBrowsePage = UserService.populateBrowsePage;
window.getRankedTeachers = UserService.getRankedTeachers;
window.isConnected = UserService.isConnected;
window.areUsersBlocked = UserService.areUsersBlocked;

// Request Service Functions
window.openRequestModal = RequestService.openRequestModal;
window.closeRequestModal = RequestService.closeRequestModal;
window.handleRequestSendClick = RequestService.handleRequestSendClick;
window.populateRequestsPage = RequestService.populateRequestsPage;
window.createMentorCard = RequestService.createMentorCard;

// Rating Service Functions ✅ IMPORTANT
window.openRatingModal = RatingService.openRatingModal;
window.closeRatingModal = RatingService.closeRatingModal;
window.handleRatingSendClick = RatingService.handleRatingSendClick;
window.submitFeedback = RatingService.submitFeedback;
window.ensureRatingModal = RatingService.ensureRatingModal;

// Chat Service Functions
window.appendMessageToList = ChatService.appendMessageToList;
window.listenToChat = ChatService.listenToChat;
window.populateChatHeader = ChatService.populateChatHeader;

// Session Service Functions
window.createSessionCard = SessionService.createSessionCard;

// ================= INITIALIZATION =================
console.log('Script.js loading...');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  // Attach validators if on signup page
  if (document.getElementById('offer') && document.getElementById('learn')) {
    console.log('Attaching language validators...');
    Validators.attachLanguageValidationToField('offer');
    Validators.attachLanguageValidationToField('learn');
  }
});

// Run Auth Guard
console.log('Running Auth Guard...');
AuthService.initAuthGuard();

// Register Auth Listener with callbacks to update UI
console.log('Registering Auth Listener...');
AuthService.registerAuthListener({
  onDashboard: (uid, user) => {
    console.log('Auth Listener: onDashboard called for uid:', uid);
    UserService.populateDashboardFor(uid, user.email, user);
  },
  onProfile: (uid, user) => {
    console.log('Auth Listener: onProfile called for uid:', uid);
    UserService.populateProfileFor(uid, user);
  },
  onBrowse: (uid) => {
    console.log('Auth Listener: onBrowse called for uid:', uid);
    UserService.populateBrowsePage(uid);
  },
  onRequests: (uid) => {
    console.log('Auth Listener: onRequests called for uid:', uid);
    RequestService.populateRequestsPage(uid);
  },
  onChat: (uid) => {
    console.log('Auth Listener: onChat called for uid:', uid);
    // Chat page specific logic
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    console.log('Chat sessionId:', sessionId);
    if (sessionId) {
      ChatService.populateChatHeader(sessionId, uid);
      ChatService.listenToChat(sessionId, uid);
    }
  }
});

console.log('Script.js initialization complete!');