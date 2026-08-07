// ==========================================
// firebase-config.js - إعدادات سحابة Firebase
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyARIEklzSIOZXcx08-muM-2qtEWdXizp2M",
  authDomain: "ahmd4mobily.firebaseapp.com",
  projectId: "ahmd4mobily",
  storageBucket: "ahmd4mobily.firebasestorage.app",
  messagingSenderId: "1098972913242",
  appId: "1:1098972913242:web:d3cdd4664818f4b2908263",
  measurementId: "G-9Y754Y66XS"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
