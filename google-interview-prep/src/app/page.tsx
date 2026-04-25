import styles from "./page.module.css";
import Link from "next/link";
import { ThemeToggle } from "@/lib/theme";

export default function Home() {
  return (
    <div className={styles.landing}>
      {/* ---------- Navbar ---------- */}
      <nav className={styles.navbar} id="main-nav">
        <div className={styles.navLogo}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-label="Google G">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>Interview Prep</span>
        </div>
        <div className={styles.navActions}>
          <ThemeToggle className={styles.themeToggle} />
          <Link href="/login" className={styles.signInBtn}>
            Sign In
          </Link>
        </div>
      </nav>

      {/* ---------- Hero ---------- */}
      <section className={styles.hero} id="hero-section">
        <div className={styles.heroBadge}>
          Powered by Google Gemini AI
        </div>

        <h1 className={styles.heroTitle}>
          <span className={styles.wordBlue}>Ace</span>{" "}
          <span className={styles.wordRed}>Your</span>{" "}
          <span className={styles.wordYellow}>Google</span>{" "}
          <span className={styles.wordGreen}>Interview</span>
        </h1>

        <p className={styles.heroDesc}>
          Practice with an AI interviewer that speaks, listens, and evaluates
          your code in real-time — just like a real Google interview. Get
          instant feedback on your coding, communication, and problem-solving
          skills.
        </p>

        <div className={styles.heroCta}>
          <Link href="/login" className={styles.ctaPrimary} id="cta-start">
            Start Practicing
          </Link>
          <Link href="#features" className={styles.ctaSecondary} id="cta-learn-more">
            Learn More
          </Link>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.stat}>
            <div className={styles.statValue}>Real-time</div>
            <div className={styles.statLabel}>Voice Conversation</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>4 Languages</div>
            <div className={styles.statLabel}>Python, JS, Java, C++</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>AI Feedback</div>
            <div className={styles.statLabel}>Detailed Reports</div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className={styles.features} id="features">
        <h2 className={styles.sectionTitle}>Everything You Need to Prepare</h2>
        <p className={styles.sectionSub}>
          A comprehensive AI-powered platform that simulates the full Google
          interview experience.
        </p>

        <div className={styles.featureGrid}>
          <div className={`${styles.featureCard} ${styles.accentBlue}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconBlue}`}>🎤</div>
            <h3 className={styles.featureTitle}>Real-Time Voice Conversation</h3>
            <p className={styles.featureDesc}>
              Talk to your AI interviewer naturally. It listens, responds
              instantly, and even stops when you interrupt — just like a real
              person.
            </p>
          </div>

          <div className={`${styles.featureCard} ${styles.accentRed}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconRed}`}>💻</div>
            <h3 className={styles.featureTitle}>Live Code Execution</h3>
            <p className={styles.featureDesc}>
              Write code in a full-featured editor. Your code compiles and runs
              against test cases in real-time, with instant pass/fail feedback.
            </p>
          </div>

          <div className={`${styles.featureCard} ${styles.accentGreen}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconGreen}`}>📹</div>
            <h3 className={styles.featureTitle}>Webcam Integration</h3>
            <p className={styles.featureDesc}>
              The AI observes your body language and engagement level through
              your webcam, providing holistic feedback on your presentation.
            </p>
          </div>

          <div className={`${styles.featureCard} ${styles.accentYellow}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconYellow}`}>🧠</div>
            <h3 className={styles.featureTitle}>Adaptive Intelligence</h3>
            <p className={styles.featureDesc}>
              The AI adjusts difficulty and gives hints progressively, just like
              a real Google interviewer would. It follows up on your approach.
            </p>
          </div>

          <div className={`${styles.featureCard} ${styles.accentBlue}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconBlue}`}>📊</div>
            <h3 className={styles.featureTitle}>Comprehensive Feedback</h3>
            <p className={styles.featureDesc}>
              Get a detailed report covering code quality, time complexity,
              communication skills, and a mock hire/no-hire decision.
            </p>
          </div>

          <div className={`${styles.featureCard} ${styles.accentRed}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconRed}`}>🎯</div>
            <h3 className={styles.featureTitle}>50+ DSA Problems</h3>
            <p className={styles.featureDesc}>
              Curated problem bank covering Arrays, Trees, Graphs, DP, and
              more — all calibrated for Google new-grad level interviews.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- How It Works ---------- */}
      <section className={styles.howItWorks} id="how-it-works">
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <p className={styles.sectionSub}>
          Three simple steps to a better interview performance.
        </p>

        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepContent}>
              <h3 className={styles.stepTitle}>Choose Your Interview Type</h3>
              <p className={styles.stepDesc}>
                Select between Coding (DSA) or Behavioral interview practice.
                Set your preferred programming language and session duration.
              </p>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepContent}>
              <h3 className={styles.stepTitle}>Interview with Your AI Interviewer</h3>
              <p className={styles.stepDesc}>
                Talk through your approach, write your solution in the code
                editor, and run it against test cases. The AI provides hints
                and follow-up questions naturally.
              </p>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepContent}>
              <h3 className={styles.stepTitle}>Review Detailed Feedback</h3>
              <p className={styles.stepDesc}>
                After the session, receive a comprehensive report with scores
                on code quality, communication, body language, and specific
                improvement recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaCard}>
          <h2 className={styles.ctaTitle}>Ready to Practice?</h2>
          <p className={styles.ctaDesc}>
            Sign in with your Google account and start your first mock
            interview in under a minute.
          </p>
          <Link href="/login" className={styles.ctaPrimary} id="cta-bottom">
            Start Free Practice
          </Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Google Interview Prep AI — Built with Gemini</p>
      </footer>
    </div>
  );
}
