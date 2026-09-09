import logoDark from '@assets/letshare4gov-logo-dark.png';
import logoOnDark from '@assets/letshare4gov-logo-on-dark.png';

export function Logo({ className = "", light = false }: { className?: string, light?: boolean }) {
  return (
    <img
      src={light ? logoOnDark : logoDark}
      alt="LetShare4Gov"
      className={`h-10 w-auto object-contain ${className}`}
      draggable={false}
    />
  );
}
