import styles from './Hero.module.scss'
import HeroBg from './HeroBg';
import Logo from '../logo/Logo';

const Hero = () => {
    return <div className={styles.hero}>
        <HeroBg />
        <Logo size={80} className={styles.logo} />
        <h1>Sunday</h1>
        <p>
            Where productivity meets peace of mind
        </p>
    </div>
};

export default Hero;