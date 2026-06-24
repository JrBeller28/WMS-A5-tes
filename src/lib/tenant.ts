import { Company, Subscription, UsageLog } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

// TENANT MIDDLEWARE LOGIC
export const checkSubscription = async (companyId: string): Promise<Subscription | null> => {
  const cacheKey = `local_subscription_${companyId}`;
  try {
    const q = query(collection(db, 'subscriptions'), where('companyId', '==', companyId));
    const snap = await getDocs(q);
    if (snap.empty) {
      const fallback = localStorage.getItem(cacheKey);
      return fallback ? JSON.parse(fallback) : null;
    }
    const subscription = snap.docs[0].data() as Subscription;
    localStorage.setItem(cacheKey, JSON.stringify(subscription));
    return subscription;
  } catch (error) {
    console.warn('checkSubscription Firestore failed, using cached subscription:', error);
    const fallback = localStorage.getItem(cacheKey);
    if (fallback) {
      return JSON.parse(fallback);
    }
    // Return a default subscription if no local storage exists to prevent blocking UI
    const defaultSub: Subscription = {
      id: `SUB_${companyId}`,
      companyId,
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
      createdAt: new Date().toISOString()
    };
    return defaultSub;
  }
};

export const checkFeature = async (companyId: string, featureKey: keyof Subscription['features']): Promise<boolean> => {
  try {
    const sub = await checkSubscription(companyId);
    if (!sub) return false;
    if (sub.status !== 'ACTIVE') return false; // expired
    return sub.features[featureKey] === true;
  } catch (error) {
    console.warn('checkFeature check failed, defaulting to true to bypass blocks:', error);
    return true; // fail open to keep system functional
  }
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
