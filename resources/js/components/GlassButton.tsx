import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LiquidGlass } from '../liquid-glass/LiquidGlass.jsx';

type GlassButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    children: ReactNode;
    className?: string;
    variant?: 'regular' | 'tinted';
    forceFallback?: boolean;
};

export function GlassButton({
    children,
    className = '',
    variant = 'regular',
    forceFallback = false,
    type = 'button',
    ...props
}: GlassButtonProps) {
    return (
        <LiquidGlass
            as="button"
            type={type}
            className={`glass-button glass-button-${variant} ${className}`.trim()}
            variant={variant}
            radius={14}
            profile="thin"
            strength={105}
            magnify={1.04}
            dispersion={0.012}
            blur={0.3}
            interactive
            forceFallback={forceFallback}
            {...props}
        >
            {children}
        </LiquidGlass>
    );
}
