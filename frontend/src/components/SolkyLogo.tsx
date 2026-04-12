interface SolkyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon';
}

export function SolkyLogo({ size = 'md', variant = 'full' }: SolkyLogoProps) {
  const iconSize = { sm: 28, md: 36, lg: 48 }[size];
  const textSize = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' }[size];
  const subSize  = { sm: 'text-[7px]', md: 'text-[9px]', lg: 'text-[11px]' }[size];

  return (
    <div className="flex items-center gap-2">
      {/* Figura stilizzata — persona con braccia aperte */}
      <svg width={iconSize} height={iconSize} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Testa */}
        <circle cx="24" cy="8" r="5" fill="#C41E3A" />
        {/* Corpo */}
        <path d="M24 14 L24 30" stroke="#C41E3A" strokeWidth="3.5" strokeLinecap="round" />
        {/* Braccia aperte verso l'alto */}
        <path d="M12 20 L24 16 L36 20" stroke="#C41E3A" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Gambe */}
        <path d="M24 30 L17 42" stroke="#C41E3A" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M24 30 L31 42" stroke="#C41E3A" strokeWidth="3.5" strokeLinecap="round" />
      </svg>

      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <div className={`${textSize} font-bold tracking-tight`}>
            <span className="text-[#C41E3A]">SOLKY</span>
            <span className="text-foreground">CARE</span>
          </div>
          <span className={`${subSize} tracking-widest text-muted-foreground uppercase font-medium mt-0.5`}>
            Cooperativa Sociale
          </span>
        </div>
      )}
    </div>
  );
}
