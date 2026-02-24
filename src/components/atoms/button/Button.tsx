import { FC, ReactNode } from "react";
import styles from '@/components/atoms/button/Button.module.scss';
import { IComponentWithChildren } from "@/types/app";

export interface ButtonProps extends IComponentWithChildren {
    variant?: 'primary' | 'secondary' | 'outline';
    size?: 'small' | 'medium' | 'large';
    onClick?: () => void;
    className?: string;
}

const Button: FC<ButtonProps> = ({ 
    children, 
    variant = 'primary', 
    size = 'medium', 
    onClick,
    className = ''
}) => {
    return (
        <button 
            className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

export default Button;