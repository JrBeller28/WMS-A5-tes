import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

export const migrateToSaaS = async () => {
    const existingCompanyId = "COMPANY_A5_CORP"; // Tenant pertama (Mewakili data saat ini)

    try {
        console.log("Starting SaaS Migration...");

        // 1. Buat Data Induk Company
        await setDoc(doc(db, "companies", existingCompanyId), {
            name: "Gudang A5 Internal",
            status: "ACTIVE",
            createdAt: new Date().toISOString()
        });
        console.log("Company created.");

        // 2. Buat "Enterprise" lifetime subscription untuk Gudang A5
        await setDoc(doc(db, "subscriptions", "SUB_A5"), {
            companyId: existingCompanyId,
            plan: "ENTERPRISE",
            status: "ACTIVE",
            startDate: new Date().toISOString(),
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 100)).toISOString(), // Lifetime-ish
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
            limits: {
                users: 9999,
                products: 999999,
                warehouses: 999
            },
            createdAt: new Date().toISOString()
        });
        console.log("Subscription created.");

        // 3. Update Existing Products, Locator, Transaction, Inventory, and Physical Counts dengan companyId
        const colls = ['products', 'transactions', 'users', 'locators', 'physical_stock_counts'];
        
        for (const col of colls) {
            console.log(`Migrating collection: ${col}`);
            const snap = await getDocs(collection(db, col));
            const batch = writeBatch(db);
            let operationCount = 0;

            for (const record of snap.docs) {
                batch.update(record.ref, { companyId: existingCompanyId });
                operationCount++;
                
                // Firestore batch limit is 500
                if (operationCount >= 450) {
                    await batch.commit();
                    operationCount = 0;
                }
            }

            if (operationCount > 0) {
                await batch.commit();
            }
        }

        console.log("Migration to SaaS Completed Successfully.");
        return { success: true, message: "Migration to SaaS complete. All records assigned to COMPANY_A5_CORP." };

    } catch (err: any) {
        console.error("Migration failed:", err);
        return { success: false, message: `Migration failed: ${err.message}` };
    }
};
