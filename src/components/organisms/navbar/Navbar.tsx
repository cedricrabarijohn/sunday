'use client';

import { useTranslations } from 'next-intl';
import Button from '../../atoms/button/Button';
import LanguageSwitcher from '../../molecules/language-switcher/LanguageSwitcher';
import ThemeToggle from '../../atoms/theme-toggle/ThemeToggle';
import styles from './Navbar.module.scss';
import LogoWithText from '@/components/molecules/logo/LogoWithText';

const Navbar = () => {
    const t = useTranslations('navbar');

    return (
        <nav className={styles.navbar}>
            <div className={styles.container}>
                <a href="/" className={styles.logoLink}>
                    <LogoWithText className={styles.logo} />
                    {/* <Logo size={40} /> */}
                    {/* <span className={styles.brandName}>Sunday</span> */}
                </a>

                <div className={styles.actions}>
                    <ThemeToggle />
                    <LanguageSwitcher />
                    <Button variant="primary" size="medium">
                        {t('getStarted')}
                    </Button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
