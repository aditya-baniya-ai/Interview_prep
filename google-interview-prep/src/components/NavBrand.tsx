import styles from "./NavBrand.module.css";

export function NavBrand({ forceDark = false }: { forceDark?: boolean }) {
  return (
    <div className={`${styles.brand} ${forceDark ? styles.brandForceDark : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/manga.png"
        alt="FAANG"
        height={30}
        className={styles.logoImg}
      />

    </div>
  );
}
