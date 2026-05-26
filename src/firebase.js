import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB_Av3dRO7_LHtVZtxjwZx11dzWKlVsgI8",
  authDomain: "depo-kontrol-86e93.firebaseapp.com",
  projectId: "depo-kontrol-86e93",
  storageBucket: "depo-kontrol-86e93.firebasestorage.app",
  messagingSenderId: "820709610917",
  appId: "1:820709610917:web:a1030c65a16fb92e22844c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
