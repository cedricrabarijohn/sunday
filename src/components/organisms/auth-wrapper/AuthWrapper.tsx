import { IComponentWithChildren } from '@/types/app';
import styles from './AuthWrapper.module.scss';
import HeroBg from '../hero/HeroBg';

export interface AuthWrapperProps extends IComponentWithChildren { }

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children, className }) => {
    return (
        <>
            <div className={`${styles['auth-wrapper']} ${className}`}>
                <HeroBg />
                {children}
            </div>
        </>
    )
};

export default AuthWrapper;