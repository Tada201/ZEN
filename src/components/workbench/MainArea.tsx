import React from 'react';
import { cn } from '@/lib/utils';

interface MainAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function MainArea({ children, className }: MainAreaProps) {
  return (
    <div className={cn("flex-1 h-full w-full relative overflow-hidden flex flex-col bg-transparent", className)}>
      {/* Content overlay */}
      <div className="relative z-10 w-full h-full flex flex-col bg-[#0b0b0d]/15">
        {children}
      </div>
    </div>
  );
}
