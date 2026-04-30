import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Staff Login API using Firebase
 * @param {string} email 
 * @param {string} password 
 */
export const staffLogin = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch additional staff data from Firestore
    const staffDoc = await getDoc(doc(db, "staff", user.uid));
    
    if (staffDoc.exists()) {
      const staffData = staffDoc.data();
      if (!staffData.is_active) {
        await auth.signOut();
        return { status: 0, message: 'Account is deactivated. Please contact your manager.' };
      }
      
      return { 
        status: 1, 
        message: 'Login successful', 
        data: { 
          id: user.uid,
          ...staffData,
          token: await user.getIdToken() 
        } 
      };
    } else {
      // Check if it's a manager/admin
      const adminDoc = await getDoc(doc(db, "users", user.uid));
      if (adminDoc.exists()) {
        return {
          status: 1,
          message: 'Login successful',
          data: {
            id: user.uid,
            ...adminDoc.data(),
            token: await user.getIdToken()
          }
        };
      }
      
      return { status: 0, message: 'Staff profile not found.' };
    }
  } catch (error) {
    console.error('Login Error:', error);
    let message = 'Login failed. Please check your credentials.';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      message = 'Invalid email or password.';
    }
    return { status: 0, message };
  }
};

