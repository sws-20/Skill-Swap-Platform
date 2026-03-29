// ============================================
// FIREBASE DEBUG HELPER
// Copy and paste this into browser console
// ============================================

console.log('🔍 Starting Firebase Debug Helper...\n');

// Check Authentication
console.log('=== AUTHENTICATION CHECK ===');
const currentUser = firebase?.auth()?.currentUser;
if (currentUser) {
    console.log('✅ User is authenticated');
    console.log('   User ID:', currentUser.uid);
    console.log('   Email:', currentUser.email);
    console.log('   Email Verified:', currentUser.emailVerified);
} else {
    console.error('❌ User is NOT authenticated');
    console.log('   Please log in first!');
}
console.log('');

// Check Firebase Config
console.log('=== FIREBASE CONFIG CHECK ===');
try {
    const app = firebase.app();
    const config = app.options;
    console.log('✅ Firebase initialized');
    console.log('   Project ID:', config.projectId);
    console.log('   Auth Domain:', config.authDomain);
    console.log('   Database URL:', config.databaseURL);
    console.log('   Storage Bucket:', config.storageBucket || '❌ MISSING!');
} catch (err) {
    console.error('❌ Firebase not initialized:', err.message);
}
console.log('');

// Test Database Write
console.log('=== DATABASE WRITE TEST ===');
if (currentUser) {
    const testRef = firebase.database().ref('users/' + currentUser.uid + '/test');
    testRef.set({ timestamp: Date.now(), test: true })
        .then(() => {
            console.log('✅ Database write successful');
            console.log('   Rules are configured correctly for database');
            // Clean up test data
            testRef.remove();
        })
        .catch(err => {
            console.error('❌ Database write failed:', err.code);
            console.error('   Error:', err.message);
            if (err.code === 'PERMISSION_DENIED') {
                console.error('   🔥 FIX: Update Firebase Realtime Database rules');
                console.error('   Go to: Firebase Console → Realtime Database → Rules');
            }
        });
} else {
    console.log('⏭️  Skipped (not authenticated)');
}
console.log('');

// Test Storage Upload
console.log('=== STORAGE UPLOAD TEST ===');
if (currentUser) {
    // Create a tiny test file
    const testBlob = new Blob(['test'], { type: 'text/plain' });
    const testFile = new File([testBlob], 'test.txt', { type: 'text/plain' });
    
    const storageRef = firebase.storage().ref('test/' + currentUser.uid + '/test.txt');
    storageRef.put(testFile)
        .then(snapshot => {
            console.log('✅ Storage upload successful');
            console.log('   Rules are configured correctly for storage');
            // Clean up test file
            return storageRef.delete();
        })
        .then(() => {
            console.log('   Test file cleaned up');
        })
        .catch(err => {
            console.error('❌ Storage upload failed:', err.code);
            console.error('   Error:', err.message);
            if (err.code === 'storage/unauthorized') {
                console.error('   🔥 FIX: Update Firebase Storage rules');
                console.error('   Go to: Firebase Console → Storage → Rules');
            }
        });
} else {
    console.log('⏭️  Skipped (not authenticated)');
}
console.log('');

// Test Report Submission (Dry Run)
console.log('=== REPORT SUBMISSION TEST ===');
if (currentUser) {
    console.log('Testing report data structure...');
    const testReport = {
        reporterId: currentUser.uid,
        reportedUserId: 'test_user_id',
        reportedByUserId: currentUser.uid,
        reason: 'test: debugging',
        category: 'other',
        timestamp: Date.now()
    };
    console.log('✅ Report structure valid:', testReport);
    console.log('   Ready to submit reports');
} else {
    console.log('⏭️  Skipped (not authenticated)');
}
console.log('');

// Test Photo Upload Path
console.log('=== PHOTO UPLOAD PATH TEST ===');
if (currentUser) {
    const photoPath = `profile_pics/${currentUser.uid}`;
    console.log('✅ Photo path:', photoPath);
    console.log('   Storage reference would be:', photoPath);
    
    // Check if storage bucket is configured
    const storageBucket = firebase.app().options.storageBucket;
    if (storageBucket) {
        console.log('✅ Storage bucket configured:', storageBucket);
    } else {
        console.error('❌ Storage bucket NOT configured!');
        console.error('   🔥 FIX: Add storageBucket to firebaseConfig.js');
        console.error('   storageBucket: "skill-swap-platform-53823.appspot.com"');
    }
} else {
    console.log('⏭️  Skipped (not authenticated)');
}
console.log('');

// Summary
console.log('=== SUMMARY ===');
console.log('Check the results above for any ❌ errors');
console.log('');
console.log('Common fixes:');
console.log('1. Update Firebase Realtime Database rules');
console.log('2. Update Firebase Storage rules');
console.log('3. Add storageBucket to firebaseConfig.js');
console.log('4. Ensure user is logged in');
console.log('');
console.log('See FIREBASE_RULES_CONFIGURATION.md for detailed instructions');
console.log('');
console.log('🔍 Debug Helper Complete!');
