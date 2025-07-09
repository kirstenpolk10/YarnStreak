// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC_V70cAlaUybjK7mD8YKLsS9U7ESm4ebQ",
  authDomain: "yarnstreak.firebaseapp.com",
  projectId: "yarnstreak",
  storageBucket: "yarnstreak.firebasestorage.app",
  messagingSenderId: "919810833945",
  appId: "1:919810833945:web:6c76bbb3d303bc6853f488",
  measurementId: "G-DYJ2PJ9RCB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

signInAnonymously(auth)
  .then(() => {
    console.log("Signed in anonymously");
  })
  .catch((error) => {
    console.error("Anonymous sign-in error", error);
  });

export { auth, db };
