'use client';

import { FC, useState, useRef, useEffect } from 'react';
import styles from './SelectBox.module.scss';

export interface SelectOption {
    value: string;
    label: string;
    icon?: string;
}

export interface SelectBoxProps {
    options: SelectOption[];
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

const SelectBox: FC<SelectBoxProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select an option',
    className = '',
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);
    const displayText = selectedOption ? selectedOption.label : placeholder;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        if (onChange) {
            onChange(optionValue);
        }
        setIsOpen(false);
    };

    return (
        <div 
            className={`${styles.selectBox} ${className} ${disabled ? styles.disabled : ''}`} 
            ref={dropdownRef}
        >
            <button
                type="button"
                className={`${styles.selectButton} ${isOpen ? styles.open : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                {selectedOption?.icon && <span className={styles.icon}>{selectedOption.icon}</span>}
                <span className={styles.selectedValue}>{displayText}</span>
                <svg 
                    className={styles.arrow} 
                    width="12" 
                    height="8" 
                    viewBox="0 0 12 8" 
                    fill="none"
                >
                    <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </button>
            
            {isOpen && (
                <div className={styles.dropdown}>
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`${styles.option} ${value === option.value ? styles.selected : ''}`}
                            onClick={() => handleSelect(option.value)}
                        >
                            <span className={styles.optionContent}>
                                {option.icon && <span className={styles.icon}>{option.icon}</span>}
                                {option.label}
                            </span>
                            {value === option.value && (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SelectBox;