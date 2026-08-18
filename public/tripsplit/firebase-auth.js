import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA1Ff2ICnQ9oP6EVAdICuM99xQqeVK5_78",
  authDomain: "tripchia-431bc.firebaseapp.com",
  projectId: "tripchia-431bc",
  storageBucket: "tripchia-431bc.firebasestorage.app",
  messagingSenderId: "396742997244",
  appId: "1:396742997244:web:eebb78f93e96140a59d379",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

await setPersistence(auth, browserLocalPersistence);

window.TripSplitFirebaseAuth = {
  onChange(callback) {
    return onAuthStateChanged(auth, callback);
  },
  async waitUntilReady() {
    await auth.authStateReady();
    return auth.currentUser;
  },
  async getIdToken() {
    await auth.authStateReady();
    return auth.currentUser ? auth.currentUser.getIdToken() : "";
  },
  async signInWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },
  async createAccount(email, password, displayName) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(credential.user, { displayName });
    return credential;
  },
  async signInWithGoogle() {
    return signInWithPopup(auth, googleProvider);
  },
  async resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  },
  async signOut() {
    return signOut(auth);
  },
};

window.dispatchEvent(new CustomEvent("tripsplit-firebase-ready"));
