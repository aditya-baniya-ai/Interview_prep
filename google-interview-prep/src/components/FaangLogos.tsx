import styles from "./faang.module.css";

export const LOGO_URLS = {
  google:  "https://www.google.com/favicon.ico",
  amazon:  "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo_SVG.svg",
  meta:    "https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg",
  apple:   "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg",
  netflix: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg",
};

/** Navbar logo row: five logos + "FAANG Prep" text */
export function FaangLogoCluster({ forceDark = false }: { forceDark?: boolean }) {
  const textClass = forceDark ? styles.clusterTextDark : styles.clusterText;
  return (
    <div className={styles.cluster}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.google}  width={20} height={20} alt="Google"  className={styles.logo} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.amazon}  width={48} height={20} alt="Amazon"  className={`${styles.logo} ${styles.logoGap}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.meta}    width={48} height={20} alt="Meta"    className={`${styles.logo} ${styles.logoGap}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.apple}   width={16} height={20} alt="Apple"   className={`${styles.logo} ${styles.logoGap} ${styles.appleLogo}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.netflix} width={40} height={20} alt="Netflix" className={`${styles.logo} ${styles.logoGap}`} />
      <span className={textClass}>FAANG Prep</span>
    </div>
  );
}

/** Dashboard full-width company banner */
export function FaangBanner() {
  return (
    <div className={styles.banner}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.google}  height={22} width={22}  alt="Google"  className={styles.bannerLogo} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.amazon}  height={22} width={53}  alt="Amazon"  className={styles.bannerLogo} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.meta}    height={22} width={53}  alt="Meta"    className={styles.bannerLogo} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.apple}   height={22} width={18}  alt="Apple"   className={`${styles.bannerLogo} ${styles.bannerApple}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URLS.netflix} height={22} width={44}  alt="Netflix" className={styles.bannerLogo} />
    </div>
  );
}
