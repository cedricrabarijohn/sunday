import { IComponentWithChildren } from '@/types/app';
import styles from './AuthWrapper.module.scss';

export interface AuthWrapperProps extends IComponentWithChildren { }

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
    return <div className={styles['auth-wrapper']}>
        {children}
    </div>
};

export default AuthWrapper;