// Supabase client wrapper for Expo/React Native.
// Loads SUPABASE_URL and SUPABASE_ANON_KEY from:
// 1) process.env
// 2) Expo Constants (app.json -> expo.extra)
// You can also call initSupabase(url, key) at runtime.

import { createClient } from '@supabase/supabase-js';

let Constants = null;
try {
  // optional require so this file can be imported in non-expo environments for testing
  // eslint-disable-next-line global-require
  Constants = require('expo-constants');
} catch (e) {
  Constants = null;
}

const resolveConfig = () => {
  const envUrl = process.env.SUPABASE_URL;
  const envKey = process.env.SUPABASE_ANON_KEY;

  const expoExtra = (Constants && (Constants.manifest?.extra || Constants.expoConfig?.extra)) || {};

  const url = envUrl || expoExtra.SUPABASE_URL || expoExtra.supabaseUrl || null;
  const key = envKey || expoExtra.SUPABASE_ANON_KEY || expoExtra.supabaseAnonKey || null;
  return { url, key };
};

let supabase = null;
// In-memory cache for signed URLs to avoid re-creating signed URLs often.
// Keyed by `${bucket}:${path}` -> { url, expiresAt }
const signedUrlCache = new Map();
// cache bucket visibility: bucket -> boolean (true = public)
const bucketPublicCache = new Map();

export function initSupabase(url, anonKey) {
  if (!url || !anonKey) {
    throw new Error('initSupabase requires both url and anonKey');
  }
  supabase = createClient(url, anonKey, { auth: { persistSession: true } });
  return supabase;
}

// Auto-init if possible (only when both url and key are present)
const cfg = resolveConfig();
if (cfg.url && cfg.key) {
  initSupabase(cfg.url, cfg.key);
} else {
  // do not auto-init with placeholders — leave uninitialized so callers can handle missing config
  // eslint-disable-next-line no-console
  console.warn('Supabase not initialized automatically because SUPABASE_URL or SUPABASE_ANON_KEY is missing. Call initSupabase(url,key) or add the keys to app.json expo.extra or environment.');
}

// Helpers — these reference the `supabase` variable at call time so re-init works.
export const auth = {
  _ensure() { if (!supabase) throw new Error('Supabase client not initialized. Call initSupabase(url, anonKey) or set SUPABASE_URL/SUPABASE_ANON_KEY in app.json expo.extra or environment.'); },
  signUp: async (email, password) => { auth._ensure(); return supabase.auth.signUp({ email, password }); },
  signIn: async (email, password) => { auth._ensure(); return supabase.auth.signInWithPassword({ email, password }); },
  signOut: async () => { auth._ensure(); return supabase.auth.signOut(); },
  getUser: async () => { auth._ensure(); return supabase.auth.getUser(); },
  onAuthStateChange: (cb) => {
    if (!supabase) throw new Error('Supabase client not initialized. Call initSupabase(url, anonKey) before subscribing to auth state.');
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      try { cb(session ? session.user : null); } catch (e) { console.warn('onAuthStateChange callback error', e); }
    });
    return () => listener?.subscription?.unsubscribe?.();
  }
};

export const db = {
  _ensure() { if (!supabase) throw new Error('Supabase client not initialized. Call initSupabase(url, anonKey) or set environment/app.json extras.'); },
  from: (table) => { db._ensure(); return supabase.from(table); },
  channel: (name) => { db._ensure(); return supabase.channel(name); }
};

export const storage = {
  _ensure() { if (!supabase) throw new Error('Supabase client not initialized. Call initSupabase(url, anonKey) or set environment/app.json extras.'); },
  bucket: (b) => ({
    upload: (path, file, opts) => { storage._ensure(); return supabase.storage.from(b).upload(path, file, opts); },
    getPublicUrl: (path) => { storage._ensure(); return supabase.storage.from(b).getPublicUrl(path); },
    createSignedUrl: (path, expires) => { storage._ensure(); return supabase.storage.from(b).createSignedUrl(path, expires); },
    // Returns a cached signed url (string) if available and not about to expire.
    // Otherwise requests a new signed url from Supabase and caches it.
    // returns { data: { signedURL }, error }
    getSignedUrl: async (path, expires = 60 * 60) => {
      storage._ensure();
      try {
        const key = `${b}:${path}`;
        const now = Date.now();
        const cached = signedUrlCache.get(key);
        // refresh if not present or expiring within 30 seconds
        if (cached && (cached.expiresAt - 30000) > now && cached.url) {
          return { data: { signedURL: cached.url } };
        }

        const res = await supabase.storage.from(b).createSignedUrl(path, expires);
        if (res.error) {
          console.warn('createSignedUrl error for path:', path, res.error);
          return { error: res.error };
        }
        // Supabase returns { data: { signedUrl: string }, error: null }
        // The logs show the response has: {"data": {"signedUrl": "..."}, "error": null}
        // Directly access the signedUrl from res.data
        const url = res?.data?.signedUrl;
        
        if (!url) {
          // If direct access doesn't work, try alternative property names
          const altUrl = res?.data?.signedURL || res?.data?.signed_url || res?.signedUrl || res?.signedURL;
          if (altUrl) {
            const expiresAt = now + (expires * 1000);
            signedUrlCache.set(key, { url: altUrl, expiresAt });
            return { data: { signedURL: altUrl } };
          }
          // Log for debugging if we still can't find it
          console.warn('createSignedUrl: URL not found in response for path:', path);
          console.warn('Response type:', typeof res);
          console.warn('Has data:', !!res?.data);
          console.warn('Response keys:', res ? Object.keys(res) : []);
          if (res?.data) {
            console.warn('Data keys:', Object.keys(res.data));
            console.warn('Data values:', res.data);
          }
          return { error: new Error('No signed URL in response') };
        }
        
        const expiresAt = now + (expires * 1000);
        signedUrlCache.set(key, { url, expiresAt });
        return { data: { signedURL: url } };
      } catch (e) {
        console.warn('getSignedUrl exception for path:', path, e);
        return { error: e };
      }
    },
    // remove a file at path
    remove: async (path) => { storage._ensure(); return supabase.storage.from(b).remove([path]); },
    // Check whether this bucket is public by probing a sentinel path's public URL.
    // We use a sentinel path that likely does not exist; a public bucket will return 404,
    // while a private bucket typically returns 401/403. Result is cached per bucket.
    isPublic: async () => {
      try {
        if (bucketPublicCache.has(b)) return bucketPublicCache.get(b);
        storage._ensure();
        const testPath = '__supabase_visibility_test__';
        const pub = supabase.storage.from(b).getPublicUrl(testPath);
        const publicUrl = pub?.data?.publicUrl || pub?.publicURL || null;
        if (!publicUrl) {
          bucketPublicCache.set(b, false);
          return false;
        }
        // probe the public url; HEAD is sufficient
        const resp = await fetch(publicUrl, { method: 'HEAD' });
        if (resp.status === 404) {
          bucketPublicCache.set(b, true);
          return true;
        }
        if (resp.status === 401 || resp.status === 403) {
          bucketPublicCache.set(b, false);
          return false;
        }
        // other statuses (200, etc.) treat as public
        bucketPublicCache.set(b, true);
        return true;
      } catch (e) {
        // network or fetch error: assume private to be safe
        bucketPublicCache.set(b, false);
        return false;
      }
    },
    // Resolve the best URL for a path: always use signed URLs (they work for both public and private buckets)
    // Returns { url, error }
    resolveUrl: async (path, expires = 60 * 60) => {
      try {
        // Always use signed URLs - they work reliably for both public and private buckets
        const signed = await storage.bucket(b).getSignedUrl(path, expires);
        if (signed.error) {
          return { error: signed.error };
        }
        // getSignedUrl returns { data: { signedURL: ... } }
        const url = signed.data?.signedURL || null;
        if (!url) {
          return { error: new Error('No signed URL returned from getSignedUrl') };
        }
        return { url };
      } catch (e) {
        return { error: e };
      }
    }
  })
};

export function getSupabaseClient() { return supabase; }

// Expose current resolved config (url,key) so other modules can use REST endpoints when needed.
export function getSupabaseConfig() {
  return resolveConfig();
}

export function isSupabaseInitialized() { return !!supabase; }

export default supabase;
