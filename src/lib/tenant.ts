import { Company, Subscription, UsageLog } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

// TENANT MIDDLEWARE LOGIC
export const checkSubscription = async (companyId: string): Promise<Subscription | null> => {
  const q = query(collection(db, 'subscriptions'), where('companyId', '==', companyId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as Subscription;
};

export const checkFeature = async (companyId: string, featureKey: keyof Subscription['features']): Promise<boolean> => {
  const sub = await checkSubscription(companyId);
  if (!sub) return false;
  if (sub.status !== 'ACTIVE') return false; // expired
  return sub.features[featureKey] === true;
};

export const logUsage = async (companyId: string, feature: string, action: string, count: number = 1) => {
  try {
    const monthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
    const docId = `${companyId}_${feature}_${monthYear}`;
    const logRef = doc(db, 'usage_logs', docId);
    
    const snap = await getDoc(logRef);
    if (snap.exists()) {
      await updateDoc(logRef, {
        count: snap.data().count + count,
        date: new Date().toISOString()
      });
    } else {
      await setDoc(logRef, {
        companyId,
        feature,
        action,
        count,
        date: new Date().toISOString()
      } as UsageLog);
    }
  } catch (error) {
    console.error('Failed to log usage:', error);
  }
};
