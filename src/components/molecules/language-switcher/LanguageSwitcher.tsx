'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { locales } from '@/i18n';
import SelectBox from '@/components/atoms/select-box/SelectBox';
import { gotTo } from '@/lib/goTo';

const languageConfig: Record<string, { name: string; flag: string }> = {
  en: { name: 'English', flag: '🇬🇧' },
  fr: { name: 'Français', flag: '🇫🇷' },
  es: { name: 'Español', flag: '🇪🇸' }
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const options = locales.map(loc => ({
    value: loc,
    label: languageConfig[loc].name,
    icon: languageConfig[loc].flag
  }));

  const switchLocale = (newLocale: string) => {
    // Remove current locale from pathname
    const pathWithoutLocale = pathname.replace(`/${locale}`, '');
    // Navigate to new locale
    gotTo(`/${newLocale}${pathWithoutLocale}`);
  };

  return (
    <SelectBox
      options={options}
      value={locale}
      onChange={switchLocale}
    />
  );
}
