'use client';

import Button from '../../atoms/button/Button';
import ThemeToggle from '../../atoms/theme-toggle/ThemeToggle';
import styles from './Navbar.module.scss';
import LogoWithText from '@/components/molecules/logo/LogoWithText';
import { PAGE_ROUTES } from '@/globals/page-routes';
import { gotTo } from '@/lib/goTo';

const Navbar = () => {
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
                    <Button
                        onClick={() => {
                            gotTo(PAGE_ROUTES.AUTH.SIGN_IN());
                        }}
                        variant="primary" size="medium">
                        Get Started
                    </Button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
