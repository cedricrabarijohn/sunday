// Logo optimized for light backgrounds
interface LogoLightProps {
    size?: number;
    className?: string;
}

const LogoLight = ({ size = 40, className = '' }: LogoLightProps) => {
    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 40 40" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Rounded square background */}
            <rect 
                x="2" 
                y="2" 
                width="36" 
                height="36" 
                rx="8" 
                fill="#FF6B6B"
            />
            
            {/* Accent shapes */}
            <circle 
                cx="32" 
                cy="8" 
                r="6" 
                fill="#FDB813"
                opacity="0.4"
            />
            
            <circle 
                cx="8" 
                cy="32" 
                r="5" 
                fill="#4ECDC4"
                opacity="0.4"
            />
            
            {/* "S" lettermark */}
            <text
                x="20"
                y="29"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontSize="24"
                fontWeight="700"
                fill="white"
                textAnchor="middle"
            >
                S
            </text>
        </svg>
    );
};

export default LogoLight;
