'use client';

import {useTranslations} from 'next-intl';
import Logo from '@/components/logo/Logo';
import LogoLight from '@/components/logo/LogoLight';
import LogoWithText from '@/components/logo/LogoWithText';
import LogoWithTextLight from '@/components/logo/LogoWithTextLight';
import styles from '../../demo-logo/page.module.scss';

export default function DemoLogoPage() {
    const t = useTranslations('demoLogo');
    
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>{t('title')}</h1>
                <p>{t('subtitle')}</p>
            </header>

            <section className={styles.section}>
                <h2>{t('logoIconOnly')}</h2>
                <div className={styles.variants}>
                    <div className={styles.card + ' ' + styles.dark}>
                        <div className={styles.logoWrapper}>
                            <Logo size={80} />
                        </div>
                        <p className={styles.label}>{t('darkTheme')}</p>
                    </div>
                    <div className={styles.card + ' ' + styles.light}>
                        <div className={styles.logoWrapper}>
                            <LogoLight size={80} />
                        </div>
                        <p className={styles.label}>{t('lightTheme')}</p>
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <h2>{t('logoWithBrand')}</h2>
                <div className={styles.variants}>
                    <div className={styles.card + ' ' + styles.dark}>
                        <div className={styles.logoWrapper}>
                            <LogoWithText size={240} />
                        </div>
                        <p className={styles.label}>{t('darkTheme')}</p>
                    </div>
                    <div className={styles.card + ' ' + styles.light}>
                        <div className={styles.logoWrapper}>
                            <LogoWithTextLight size={240} />
                        </div>
                        <p className={styles.label}>{t('lightTheme')}</p>
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <h2>{t('sizeExamples')}</h2>
                <div className={styles.sizeGrid}>
                    <div className={styles.sizeCard}>
                        <Logo size={32} />
                        <span>32px</span>
                    </div>
                    <div className={styles.sizeCard}>
                        <Logo size={48} />
                        <span>48px</span>
                    </div>
                    <div className={styles.sizeCard}>
                        <Logo size={64} />
                        <span>64px</span>
                    </div>
                    <div className={styles.sizeCard}>
                        <Logo size={96} />
                        <span>96px</span>
                    </div>
                </div>
            </section>

            <section className={styles.section}>
                <h2>{t('downloadSvg')}</h2>
                <div className={styles.downloadGrid}>
                    <div className={styles.downloadCard}>
                        <img src="/logo.svg" alt="Logo" width={60} height={60} />
                        <span>logo.svg</span>
                        <a href="/logo.svg" download className={styles.downloadBtn}>{t('download')}</a>
                    </div>
                    <div className={styles.downloadCard}>
                        <img src="/logo-light.svg" alt="Logo Light" width={60} height={60} />
                        <span>logo-light.svg</span>
                        <a href="/logo-light.svg" download className={styles.downloadBtn}>{t('download')}</a>
                    </div>
                    <div className={styles.downloadCard}>
                        <img src="/logo-with-text.svg" alt="Logo with Text" width={160} height={50} />
                        <span>logo-with-text.svg</span>
                        <a href="/logo-with-text.svg" download className={styles.downloadBtn}>{t('download')}</a>
                    </div>
                    <div className={styles.downloadCard}>
                        <img src="/logo-with-text-light.svg" alt="Logo with Text Light" width={160} height={50} />
                        <span>logo-with-text-light.svg</span>
                        <a href="/logo-with-text-light.svg" download className={styles.downloadBtn}>{t('download')}</a>
                    </div>
                </div>
            </section>

            <footer className={styles.footer}>
                <a href="/">← {t('backToHome')}</a>
            </footer>
        </div>
    );
}
