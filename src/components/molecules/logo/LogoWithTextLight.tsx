// Logo with app name - light theme version
interface LogoWithTextLightProps {
    size?: number;
    className?: string;
}

const LogoWithTextLight = ({ size = 120, className = '' }: LogoWithTextLightProps) => {
    const logoSize = size * 0.35;
    
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
            <circle cx="32" cy="13" r="6" fill="#FDB813" opacity="0.4"/>
            <circle cx="8" cy="37" r="5" fill="#4ECDC4" opacity="0.4"/>
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
            
            {/* App name - dark for light backgrounds */}
            <text 
                x="50" 
                y="36" 
                fontFamily="system-ui, -apple-system, sans-serif" 
                fontSize="32" 
                fontWeight="700" 
                fill="#1a1a1a" 
                letterSpacing="-0.5"
            >
                Sunday
            </text>
        </svg>
    );
};

export default LogoWithTextLight;
