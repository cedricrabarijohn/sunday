const HeroBg = () => {
    return <svg 
        style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0.8
        }}
        xmlns="http://www.w3.org/2000/svg"
    >
        <defs>
            <pattern 
                id="dotPattern" 
                x="0" 
                y="0" 
                width="30" 
                height="30" 
                patternUnits="userSpaceOnUse"
            >
                <circle 
                    cx="15" 
                    cy="15" 
                    r="1.5" 
                    fill="#404040"
                />
            </pattern>
        </defs>
        <rect 
            width="100%" 
            height="100%" 
            fill="#0a0a0a"
        />
        <rect 
            width="100%" 
            height="100%" 
            fill="url(#dotPattern)"
        />
    </svg>
}
export default HeroBg;