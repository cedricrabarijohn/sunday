import Logo from '../logo/Logo';
import Button from '../button/Button';
import styles from './Navbar.module.scss';

const Navbar = () => {
    return (
        <nav className={styles.navbar}>
            <div className={styles.container}>
                <a href="/" className={styles.logoLink}>
                    <Logo size={40} />
                    <span className={styles.brandName}>Sunday</span>
                </a>
                
                <div className={styles.actions}>
                    <Button variant="primary" size="medium">
                        Get Started
                    </Button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
