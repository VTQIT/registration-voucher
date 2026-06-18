import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  writeBatch,
  serverTimestamp,
  deleteDoc,
  orderBy,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { AppUser, PromoVoucher } from "./types";

const USERS_COLL = "users";
const VOUCHERS_COLL = "promo_vouchers";

/**
 * Gets a user's local profile
 */
export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const path = `${USERS_COLL}/${uid}`;
  try {
    const docRef = doc(db, USERS_COLL, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AppUser;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Gets details of a specific voucher code
 */
export async function getVoucherDetails(code: string): Promise<PromoVoucher | null> {
  const path = `${VOUCHERS_COLL}/${code}`;
  try {
    const docRef = doc(db, VOUCHERS_COLL, code);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as PromoVoucher;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Redeeems the first available WiFi voucher code using an atomic Firestore transaction.
 * Retries are integrated if another client claims the temporary voucher code concurrently.
 */
export async function redeemWiFiPromoVoucherTransaction(
  uid: string,
  email: string
): Promise<string> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    // Step 1: Query first unused voucher
    let unusedVoucherCode: string | null = null;
    const pathQuery = VOUCHERS_COLL;
    try {
      const q = query(
        collection(db, VOUCHERS_COLL),
        where("used", "==", false),
        orderBy("code", "asc"),
        limit(1)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        unusedVoucherCode = querySnap.docs[0].id;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, pathQuery);
    }

    if (!unusedVoucherCode) {
      throw new Error("NO_VOUCHERS_AVAILABLE");
    }

    // Step 2: Try atomic redemption transaction
    try {
      const finalVoucher = await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, USERS_COLL, uid);
        const voucherDocRef = doc(db, VOUCHERS_COLL, unusedVoucherCode as string);

        const userDocSnap = await transaction.get(userDocRef);
        if (userDocSnap.exists()) {
          const uData = userDocSnap.data();
          if (uData.voucher) {
            return uData.voucher as string;
          }
        }

        const voucherSnap = await transaction.get(voucherDocRef);
        if (!voucherSnap.exists()) {
          throw new Error("VOUCHER_NOT_FOUND_IN_DB");
        }

        const voucherData = voucherSnap.data() as PromoVoucher;
        if (voucherData.used) {
          throw new Error("CONCURRENT_VOUCHER_CLAIMED");
        }

        // Commit transaction writes
        transaction.update(voucherDocRef, {
          used: true,
          usedBy: email,
          usedAt: serverTimestamp(),
        });

        transaction.set(userDocRef, {
          uid: uid,
          email: email,
          voucher: unusedVoucherCode,
          createdAt: serverTimestamp(),
        });

        return unusedVoucherCode;
      });

      return finalVoucher;
    } catch (txError: any) {
      if (txError.message === "CONCURRENT_VOUCHER_CLAIMED" && attempt < maxRetries) {
        console.warn(`Voucher ${unusedVoucherCode} was locked. Retrying redemption (attempt ${attempt + 1})...`);
        continue; // Try next voucher representation
      }
      handleFirestoreError(txError, OperationType.WRITE, USERS_COLL);
    }
  }

  throw new Error("VOUCHER_REDEEM_LIMIT_REACHED");
}

/**
 * Retrieves the complete voucher redemption history of a user.
 * Client-side sorted by claim timestamp to prevent Firestore composite index requirements.
 */
export async function getUserVouchersHistory(email: string): Promise<PromoVoucher[]> {
  const path = VOUCHERS_COLL;
  try {
    const q = query(
      collection(db, VOUCHERS_COLL),
      where("usedBy", "==", email)
    );
    const querySnap = await getDocs(q);
    const list: PromoVoucher[] = [];
    querySnap.forEach((d) => {
      list.push(d.data() as PromoVoucher);
    });
    
    // Sort desc safely on client
    list.sort((a, b) => {
      const tA = a.usedAt ? (typeof (a.usedAt as any).seconds === 'number' ? (a.usedAt as any).seconds * 1000 : new Date(a.usedAt as any).getTime()) : 0;
      const tB = b.usedAt ? (typeof (b.usedAt as any).seconds === 'number' ? (b.usedAt as any).seconds * 1000 : new Date(b.usedAt as any).getTime()) : 0;
      return tB - tA;
    });
    return list;
  } catch (error) {
    console.error("Error retrieving user voucher history:", error);
    return [];
  }
}

/**
 * claimAdditionalWiFiVoucher finds the next unused voucher and assigns it as the user's active code,
 * appending to their claim history under their email address.
 */
export async function claimAdditionalWiFiVoucher(uid: string, email: string): Promise<string> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    let unusedVoucherCode: string | null = null;
    try {
      const q = query(
        collection(db, VOUCHERS_COLL),
        where("used", "==", false),
        orderBy("code", "asc"),
        limit(1)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        unusedVoucherCode = querySnap.docs[0].id;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, VOUCHERS_COLL);
    }

    if (!unusedVoucherCode) {
      throw new Error("NO_VOUCHERS_AVAILABLE");
    }

    try {
      const finalVoucher = await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, USERS_COLL, uid);
        const voucherDocRef = doc(db, VOUCHERS_COLL, unusedVoucherCode as string);

        const voucherSnap = await transaction.get(voucherDocRef);
        if (!voucherSnap.exists()) {
          throw new Error("VOUCHER_NOT_FOUND_IN_DB");
        }

        const voucherData = voucherSnap.data() as PromoVoucher;
        if (voucherData.used) {
          throw new Error("CONCURRENT_VOUCHER_CLAIMED");
        }

        transaction.update(voucherDocRef, {
          used: true,
          usedBy: email,
          usedAt: serverTimestamp(),
        });

        transaction.update(userDocRef, {
          voucher: unusedVoucherCode,
        });

        return unusedVoucherCode;
      });

      return finalVoucher;
    } catch (txError: any) {
      if (txError.message === "CONCURRENT_VOUCHER_CLAIMED" && attempt < maxRetries) {
        continue;
      }
      handleFirestoreError(txError, OperationType.WRITE, USERS_COLL);
    }
  }

  throw new Error("VOUCHER_REDEEM_LIMIT_REACHED");
}

/**
 * Seeding Tool - Populates FREE001 through FREE005
 */
export async function seedVouchersInFirestore(): Promise<void> {
  const codes = ["FREE001", "FREE002", "FREE003", "FREE004", "FREE005"];
  const duration = "12 Hours";
  const path = VOUCHERS_COLL;

  try {
    const batch = writeBatch(db);
    for (const code of codes) {
      const docRef = doc(db, VOUCHERS_COLL, code);
      batch.set(docRef, {
        code,
        duration,
        used: false,
        usedBy: "",
        usedAt: null,
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Reset Tool - Fully clears user profiles and sets all vouchers as unused
 */
export async function resetDatabaseForTesting(): Promise<void> {
  try {
    // 1. Delete all users
    const usersSnap = await getDocs(collection(db, USERS_COLL));
    const batch1 = writeBatch(db);
    usersSnap.forEach((userDoc) => {
      batch1.delete(userDoc.ref);
    });
    await batch1.commit();

    // 2. Set all vouchers as unused or fully reset FREE001 - FREE005
    const vouchersSnap = await getDocs(collection(db, VOUCHERS_COLL));
    const batch2 = writeBatch(db);
    
    // If empty, we seed them, otherwise we just reset existing ones
    if (vouchersSnap.empty) {
      const codes = ["FREE001", "FREE002", "FREE003", "FREE004", "FREE005"];
      for (const code of codes) {
        batch2.set(doc(db, VOUCHERS_COLL, code), {
          code,
          duration: "12 Hours",
          used: false,
          usedBy: "",
          usedAt: null,
        });
      }
    } else {
      vouchersSnap.forEach((vDoc) => {
        batch2.update(vDoc.ref, {
          used: false,
          usedBy: "",
          usedAt: null,
        });
      });
    }
    await batch2.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, USERS_COLL);
  }
}

/**
 * Fetch all available vouchers for the Administrator Panel showing current states
 */
export async function getAllVouchersForAdmin(): Promise<PromoVoucher[]> {
  const path = VOUCHERS_COLL;
  try {
    const querySnap = await getDocs(query(collection(db, VOUCHERS_COLL), orderBy("code", "asc")));
    const list: PromoVoucher[] = [];
    querySnap.forEach((d) => {
      list.push(d.data() as PromoVoucher);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
