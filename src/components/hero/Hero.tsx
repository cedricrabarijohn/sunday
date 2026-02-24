import Button from '../button/Button';
import styles from './Hero.module.scss'
import HeroBg from './HeroBg';

const Hero = () => {
    return <div className={styles.hero}>
        <HeroBg />
        <div className={styles.heroContent}>
            <p>
                Where productivity meets peace of mind
            </p>
            <Button variant="primary" size="medium">
                Start today
            </Button>
        </div>
    </div>
};

export default Hero;