"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { FaangLogoCluster } from "@/components/FaangLogos";
import styles from "./login.module.css";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (!loading && user) {
    return null; // prevent flashing the login UI before redirect triggers
  }

  const handleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to sign in. Please try again.";
      setError(errorMessage);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <div className={styles.loginLogo}>
          <FaangLogoCluster />
        </div>

        <h1 className={styles.loginTitle}>Welcome Back</h1>
        <p className={styles.loginSub}>
          Sign in to start practicing for your FAANG interview
        </p>

        <button
          className={styles.googleBtn}
          onClick={handleSignIn}
          disabled={isSigningIn || loading}
          id="google-sign-in-btn"
        >
          {isSigningIn ? (
            <span className={styles.loadingSpinner}></span>
          ) : (
            <>
              <svg
                className={styles.googleBtnIcon}
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        {error && (
          <div className={styles.loginError} role="alert">
            {error}
          </div>
        )}

        <div className={styles.loginDivider}>or</div>

        <p className={styles.loginFooter}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
          Your interview data is encrypted and never shared.
        </p>
      </div>
    </div>
  );
}
