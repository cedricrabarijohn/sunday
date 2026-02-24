'use client';

import {useTranslations} from 'next-intl';
import Button from '../button/Button';
import styles from './Hero.module.scss'
import HeroBg from './HeroBg';

const Hero = () => {
    const t = useTranslations('hero');
    
    return <div className={styles.hero}>
        <HeroBg />
        <div className={styles.heroContent}>
            <p>
                {t('subtitle')}
            </p>
            <Button variant="primary" size="medium">
                {t('cta')}
            </Button>
        </div>
    </div>
};

export default Hero;