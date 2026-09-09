import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import logoDark from '@assets/letshare4gov-logo-dark.png';
import logoOnDark from '@assets/letshare4gov-logo-on-dark.png';
import logoMark from '@assets/letshare4gov-mark.png';

interface LogoProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'light' | 'dark' | 'auto';
  showText?: boolean;
}

export function Logo({ variant = 'auto', showText = true, className, ...props }: LogoProps) {
  const logoSource = showText
    ? variant === 'light'
      ? logoOnDark
      : logoDark
    : logoMark;

  return (
    <div className={cn("flex items-center", className)} {...props}>
      <img
        src={logoSource}
        alt="LetShare4Gov"
        className={cn(showText ? "h-8 w-auto object-contain" : "h-8 w-8 object-contain")}
        draggable={false}
      />
    </div>
  );
}
