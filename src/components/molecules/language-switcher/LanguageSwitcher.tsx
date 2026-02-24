'use client';

import {useLocale} from 'next-intl';
import {usePathname, useRouter} from 'next/navigation';
import {locales} from '@/i18n';
import styles from './LanguageSwitcher.module.scss';

const languageNames: Record<string, string> = {
  en: 'EN',
  fr: 'FR',
  es: 'ES'
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: string) => {
    // Remove current locale from pathname
    const pathWithoutLocale = pathname.replace(`/${locale}`, '');
    // Navigate to new locale
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  return (
    <div className={styles.switcher}>
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          className={`${styles.button} ${locale === loc ? styles.active : ''}`}
        >
          {languageNames[loc]}
        </button>
      ))}
    </div>
  );
}
