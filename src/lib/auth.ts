import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { v4 as uuidv4 } from 'uuid';

export const USERS = [
  { username: 'adminA5', password: 'admin123', role: 'Admin A5', name: 'Iwan Gunawan', companyId: 'COMPANY_A5_CORP' },
  { username: 'petugasA5', password: 'petugas123', role: 'Petugas', name: 'Arief Nugroho', companyId: 'COMPANY_A5_CORP' },
  { username: 'kasiejkt', password: 'kasiejkt123', role: 'Kepala Gudang JKT', name: 'Moch. Johar Prasojo', companyId: 'COMPANY_A5_CORP' },
  { username: 'admin', password: 'admin123', role: 'Super Admin', name: 'HQ Warehouse', companyId: 'COMPANY_A5_CORP' },
  { username: 'adji', password: 'adji123', role: 'Developer', name: 'Adji Prasetyo', companyId: 'COMPANY_A5_CORP' },
  { username: 'adminpps', password: 'pps123', role: 'Super Admin', name: 'Budi (WMS PPS)', companyId: 'COMPANY_PPS' },
  { username: 'adminbillstone', password: 'billstone123', role: 'Super Admin', name: 'Admin (Gudang Billstone)', companyId: 'COMPANY_BILLSTONE' }
];

export const loginUser = async (usernameOrEmail: string, password: string) => {
  let email = usernameOrEmail.trim();
  let username = usernameOrEmail.trim();
  
  if (!email.includes('@')) {
    email = `${username.toLowerCase()}@gudangpsn.com`;
  } else {
    username = email.split('@')[0];
  }

  try {
    // 1. Sign in with Firebase Authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // 2. Fetch secure roles from Firestoreusers collection
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    let loggedInUser;
    if (userDocSnap.exists()) {
      loggedInUser = userDocSnap.data();
    } else {
      // Autocreate Firestore user doc if firebase auth exists but firestore profile does not
      const staticUser = USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
      const role = staticUser ? staticUser.role : 'Petugas';
      const name = staticUser ? staticUser.name : username;
      
      const newProfile = {
        uid: firebaseUser.uid,
        username,
        email,
        role,
        name,
        companyId: staticUser ? staticUser.companyId : 'COMPANY_A5_CORP'
      };
      await setDoc(userDocRef, newProfile);
      loggedInUser = newProfile;
    }

    // 3. Setup session tracking to prevent concurrent logins
    const sessionId = uuidv4();
    await setDoc(doc(db, 'sessions', loggedInUser.username), {
      sessionId,
      lastActive: new Date().toISOString()
    });

    const sessionUser = {
      uid: firebaseUser.uid,
      username: loggedInUser.username,
      role: loggedInUser.role,
      name: loggedInUser.name,
      companyId: loggedInUser.companyId,
      sessionId
    };

    localStorage.setItem('currentUser', JSON.stringify(sessionUser));
    return sessionUser;

  } catch (err: any) {
    // Fallback: If user is one of the initial static default accounts, register them into Firebase Auth on-the-fly!
    const staticUser = USERS.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );

    if (staticUser && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password')) {
      try {
        // Let's attempt to create the user in Firebase Auth
        const createCredential = await createUserWithEmailAndPassword(auth, email, password);
        const fbUser = createCredential.user;

        const profileData = {
          uid: fbUser.uid,
          username: staticUser.username,
          email: email,
          role: staticUser.role,
          name: staticUser.name,
          companyId: staticUser.companyId
        };

        // Write the role-based profile to the Firestore users collection
        await setDoc(doc(db, 'users', fbUser.uid), profileData);

        // Seed Company and Subscription if it doesn't exist
        await setDoc(doc(db, 'companies', staticUser.companyId), {
          name: staticUser.companyId === 'COMPANY_PPS' ? 'WMS PPS Tenant' : staticUser.companyId === 'COMPANY_BILLSTONE' ? 'Gudang Billstone' : 'Default Tenant',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        }, { merge: true });

        await setDoc(doc(db, 'subscriptions', `SUB_${staticUser.companyId}`), {
          companyId: staticUser.companyId,
          plan: 'ENTERPRISE',
          status: 'ACTIVE',
          startDate: new Date().toISOString(),
          endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)).toISOString(),
          autoRenew: true,
          features: {
              barcodeScanner: true,
              batch: true,
              auditLog: true,
              exportReport: true,
              multiWarehouse: true,
              customWorkflow: true,
              apiIntegration: true,
          },
          limits: { users: 9999, products: 99999, warehouses: 99 },
          createdAt: new Date().toISOString()
        }, { merge: true });

        const sessionId = uuidv4();
        await setDoc(doc(db, 'sessions', staticUser.username), {
          sessionId,
          lastActive: new Date().toISOString()
        });

        const sessionUser = {
          uid: fbUser.uid,
          username: staticUser.username,
          role: staticUser.role,
          name: staticUser.name,
          companyId: staticUser.companyId,
          sessionId
        };

        localStorage.setItem('currentUser', JSON.stringify(sessionUser));
        return sessionUser;

      } catch (signupErr: any) {
        throw new Error(`Gagal memigrasikan akun default ke Firebase Auth: ${signupErr.message}`);
      }
    }

    // Map typical Firebase warnings into polite, neat, and highly legible Indonesian warnings
    let friendlyMessage = err.message;
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
      friendlyMessage = "Password salah atau akun tidak terdaftar dengan benar di Firebase.";
    } else if (err.code === 'auth/network-request-failed') {
      friendlyMessage = "Koneksi ke server Firebase gagal. Mohon periksa internet Anda.";
    } else if (err.code === 'auth/too-many-requests') {
      friendlyMessage = "Terlalu banyak percobaan masuk. Silakan tunggu beberapa saat.";
    }
    throw new Error(friendlyMessage);
  }
};

export const registerUser = async (fullName: string, usernameInput: string, emailInput: string, roleInput: string, passwordInput: string, companyIdOverride?: string) => {
  const username = usernameInput.trim();
  const name = fullName.trim();
  const role = roleInput;
  const email = emailInput.includes('@') ? emailInput.trim() : `${username.toLowerCase()}@gudangpsn.com`;

  try {
    // 1. Create User in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, passwordInput);
    const firebaseUser = userCredential.user;

    // Get company ID of the inviting user
    const loggedInStr = localStorage.getItem('currentUser');
    const companyId = companyIdOverride || (loggedInStr ? JSON.parse(loggedInStr).companyId || 'COMPANY_A5_CORP' : 'COMPANY_A5_CORP');

    // 2. Write details into Firestore users collection
    const profileData = {
      uid: firebaseUser.uid,
      username,
      email,
      role,
      name,
      companyId
    };
    await setDoc(doc(db, 'users', firebaseUser.uid), profileData);

    return profileData;
  } catch (err: any) {
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') {
      msg = "Alamat email / username tersebut sudah terdaftar.";
    } else if (err.code === 'auth/weak-password') {
      msg = "Password terlalu lemah. Masukkan minimal 6 karakter.";
    }
    throw new Error(msg);
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Firebase SignOut error:", err);
  }
  localStorage.removeItem('currentUser');
};

export const getCurrentUser = () => {
  const stored = localStorage.getItem('currentUser');
  return stored ? JSON.parse(stored) : null;
};

