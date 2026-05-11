import React from 'react';

export const BRAND_LOGO_URL = '/brand/sirlekas-icon-logo.png';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-11 h-11 rounded-xl',
  lg: 'w-16 h-16 rounded-2xl',
};

const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'lg', showText = true, className = '' }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <span className={`${sizeClasses[size]} overflow-hidden border border-white shadow-lg shadow-blue-100 flex-shrink-0 bg-[#104997]`}>
      <img
        src={BRAND_LOGO_URL}
        alt="Sirlekas Ventures logo"
        className="w-full h-full object-cover scale-[1.32]"
        loading="eager"
        decoding="async"
      />
    </span>
    {showText && (
      <div className="flex flex-col">
        <span className="text-xl font-extrabold tracking-tighter text-slate-900 leading-none">SIRLEKAS</span>
        <span className="text-[10px] font-black tracking-[0.3em] text-[#0047AB] uppercase">VENTURES</span>
      </div>
    )}
  </div>
);

export default BrandLogo;
