import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <div className={styles.landing}>
      {/* ---------- Navbar ---------- */}
      <nav className={styles.navbar} id="main-nav">
        <div className={styles.navLogo}>
          <div className={styles.logoIcon}>G</div>
          Interview Prep AI
        </div>
        <div className={styles.navActions}>
          <Link href="/login" className="btn btn-ghost">
            Sign In
          </Link>
          <Link href="/login" className="btn btn-primary">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ---------- Hero ---------- */}
      <section className={styles.hero} id="hero-section">
        <div className={styles.heroTag}>
          <span className={styles.heroTagDot}></span>
          Powered by Google Gemini AI
        </div>

        <h1 className={styles.heroTitle}>
          Ace Your{" "}
          <span className={styles.heroGradient}>FAANG Interview</span>
          <br />
          With AI Practice
        </h1>

        <p className={styles.heroDesc}>
          Practice with an AI interviewer that speaks, listens, and evaluates
          your code in real-time — just like a real FAANG interview. Get
          instant feedback on your coding, communication, and problem-solving
          skills.
        </p>

        <div className={styles.heroCta}>
          <Link
            href="/login"
            className={`btn btn-primary ${styles.heroCtaBtn}`}
            id="cta-start"
          >
            Start Practicing →
          </Link>
          <Link
            href="#features"
            className={`btn btn-secondary ${styles.heroCtaBtn}`}
            id="cta-learn-more"
          >
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
        <h2 className={styles.sectionTitle}>
          Everything You Need to Prepare
        </h2>
        <p className={styles.sectionSub}>
          A comprehensive AI-powered platform that simulates the full Google
          interview experience.
        </p>

        <div className={styles.featureGrid}>
          <div className={`card ${styles.featureCard}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconBlue}`}>
              🎤
            </div>
            <h3 className={styles.featureTitle}>
              Real-Time Voice Conversation
            </h3>
            <p className={styles.featureDesc}>
              Talk to your AI interviewer naturally. It listens, responds
              instantly, and even stops when you interrupt — just like a real
              person.
            </p>
          </div>

          <div className={`card ${styles.featureCard}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconGreen}`}>
              💻
            </div>
            <h3 className={styles.featureTitle}>Live Code Execution</h3>
            <p className={styles.featureDesc}>
              Write code in a full-featured editor. Your code compiles and runs
              against test cases in real-time, with instant pass/fail feedback.
            </p>
          </div>

          <div className={`card ${styles.featureCard}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconYellow}`}>
              📹
            </div>
            <h3 className={styles.featureTitle}>Webcam Integration</h3>
            <p className={styles.featureDesc}>
              The AI observes your body language and engagement level through
              your webcam, providing holistic feedback on your presentation.
            </p>
          </div>

          <div className={`card ${styles.featureCard}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconRed}`}>
              🧠
            </div>
            <h3 className={styles.featureTitle}>Adaptive Intelligence</h3>
            <p className={styles.featureDesc}>
              The AI adjusts difficulty and gives hints progressively, just like
              a real FAANG interviewer would. It follows up on your approach.
            </p>
          </div>

          <div className={`card ${styles.featureCard}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconOrange}`}>
              📊
            </div>
            <h3 className={styles.featureTitle}>Comprehensive Feedback</h3>
            <p className={styles.featureDesc}>
              Get a detailed report covering code quality, time complexity,
              communication skills, and a mock hire/no-hire decision.
            </p>
          </div>

          <div className={`card ${styles.featureCard}`}>
            <div className={`${styles.featureIcon} ${styles.featureIconPurple}`}>
              🎯
            </div>
            <h3 className={styles.featureTitle}>
              50+ DSA Problems
            </h3>
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
              <h3 className={styles.stepTitle}>
                Interview with Your AI Interviewer
              </h3>
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
              <h3 className={styles.stepTitle}>
                Review Detailed Feedback
              </h3>
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
      <section className={styles.cta}>
        <div className={styles.ctaCard}>
          <h2 className={styles.ctaTitle}>Ready to Practice?</h2>
          <p className={styles.ctaDesc}>
            Sign in with your Google account and start your first mock
            interview in under a minute.
          </p>
          <Link
            href="/login"
            className="btn btn-primary btn-lg"
            id="cta-bottom"
          >
            Start Free Practice →
          </Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className={styles.footer}>
        <p>
          © {new Date().getFullYear()} FAANG Interview Prep AI — Built with
          Gemini & Google ADK
        </p>
      </footer>
    </div>
  );
}
