import { TelemetryPoint } from '../types/flight';

const DB_NAME = 'apollo-telemetry-cache';
const DB_VERSION = 1;
const STORE_NAME = 'flight_telemetry';

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'flightId' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Persists raw telemetry points into IndexedDB.
 * Unlike localStorage (which has a strict 5MB limit across all data),
 * IndexedDB supports hundreds of megabytes of telemetry data, making it
 * ideal for local persistence in dev and web environments.
 */
export async function saveFlightTelemetry(flightId: string, points: TelemetryPoint[]): Promise<void> {
  if (!flightId || !points || points.length === 0) return;
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ flightId, points });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Retrieves cached telemetry points from IndexedDB for a given flight ID.
 */
export async function getFlightTelemetry(flightId: string): Promise<TelemetryPoint[] | null> {
  if (!flightId) return null;
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(flightId);

      request.onsuccess = () => {
        if (request.result && Array.isArray(request.result.points)) {
          resolve(request.result.points);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Deletes cached telemetry points for a given flight ID.
 */
export async function deleteFlightTelemetry(flightId: string): Promise<void> {
  if (!flightId) return;
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(flightId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
