"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  getRedirectResult,
  signOut as firebaseSignOut,
} from "@firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

// Mobile browsers (especially iOS Safari) don't reliably support
// signInWithPopup — popups get blocked, COOP closes them early, etc.
// Detect once at module load and use signInWithRedirect for those.
function isMobileBrowser(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInAsGuest: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    // Handle the redirect result on page load (mobile sign-in returns here).
    // Errors are non-fatal — onAuthStateChanged is the source of truth.
    getRedirectResult(auth).catch((error) => {
      console.error("Redirect sign-in error:", error);
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error("Firebase not initialized");
    }
    try {
      if (isMobileBrowser()) {
        // Mobile: full-page redirect to Google, then back to our app.
        // The result is picked up by getRedirectResult() above on mount.
        await signInWithRedirect(auth, googleProvider);
      } else {
        // Desktop: popup keeps the user on our page.
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  };

  const signInAsGuest = async () => {
    if (!auth) {
      throw new Error("Firebase not initialized");
    }
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Guest sign-in error:", error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInAsGuest, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
