import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { v4 as uuidv4 } from 'uuid';

export const USERS = [
  { username: 'adminA5', password: 'admin123', role: 'Admin A5', name: 'Iwan Gunawan' },
  { username: 'petugasA5', password: 'petugas123', role: 'Petugas', name: 'Arief Nugroho' },
  { username: 'kasiejkt', password: 'kasiejkt123', role: 'Kepala Gudang JKT', name: 'Moch. Johar Prasojo' },
  { username: 'admin', password: 'admin123', role: 'Super Admin', name: 'HQ Warehouse' }
];

export const loginUser = async (username: string, password: string) => {
  const user = USERS.find(u => u.username === username && u.password === password);
  if (user) {
    const sessionId = uuidv4();
    await setDoc(doc(db, 'sessions', user.username), {
      sessionId,
      lastActive: new Date().toISOString()
    });

    localStorage.setItem('currentUser', JSON.stringify({
       username: user.username,
       role: user.role,
       name: user.name,
       sessionId
    }));
    return user;
  }
  throw new Error("Invalid username or password");
};

export const logoutUser = () => {
  localStorage.removeItem('currentUser');
};

export const getCurrentUser = () => {
  const stored = localStorage.getItem('currentUser');
  return stored ? JSON.parse(stored) : null;
};
