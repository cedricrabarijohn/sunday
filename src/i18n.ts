import {getRequestConfig} from 'next-intl/server';

// Can be imported from a shared config
export const locales = ['en', 'fr', 'es'] as const;
export const defaultLocale = 'en';

export default getRequestConfig(async ({requestLocale}) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure a valid locale is used
  if (!locale || !locales.includes(locale as any)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
