'use client';

import {useTranslations} from 'next-intl';
import Logo from '../logo/Logo';
import Button from '../button/Button';
import LanguageSwitcher from '../language-switcher/LanguageSwitcher';
import styles from './Navbar.module.scss';

const Navbar = () => {
    const t = useTranslations('navbar');
    
    return (
        <nav className={styles.navbar}>
            <div className={styles.container}>
                <a href="/" className={styles.logoLink}>
                    <Logo size={40} />
                    <span className={styles.brandName}>Sunday</span>
                </a>
                
                <div className={styles.actions}>
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
