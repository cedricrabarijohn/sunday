// Logo with app name "Sunday"
interface LogoWithTextProps {
    size?: number;
    className?: string;
}

const LogoWithText = ({ size = 120, className = '' }: LogoWithTextProps) => {
    const logoSize = size * 0.35; // Logo takes 35% of total width
    const fontSize = size * 0.18;
    
    return (
        <svg 
            width={size} 
            height={logoSize} 
            viewBox="0 0 160 50" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Logo icon */}
            <rect x="2" y="7" width="36" height="36" rx="8" fill="#FF6B6B"/>
            <circle cx="32" cy="13" r="6" fill="#FDB813" opacity="0.3"/>
            <circle cx="8" cy="37" r="5" fill="#4ECDC4" opacity="0.3"/>
            <text 
                x="20" 
                y="34" 
                fontFamily="system-ui, -apple-system, sans-serif" 
                fontSize="24" 
                fontWeight="700" 
                fill="white" 
                textAnchor="middle"
            >
                S
            </text>
            
            {/* App name */}
            <text
                className="logo-app-name" 
                x="50" 
                y="36" 
                fontFamily="system-ui, -apple-system, sans-serif" 
                fontSize="32" 
                fontWeight="700" 
                fill="var(--logo-text-fill, #ededed)" 
                letterSpacing="-0.5"
            >
                Sunday
            </text>
        </svg>
    );
};

export default LogoWithText;
