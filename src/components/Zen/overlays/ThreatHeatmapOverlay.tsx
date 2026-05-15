import React from 'react';
import { cn } from '@/lib/utils/style';

interface ThreatHeatmapOverlayProps {
  className?: string;
}

const ThreatHeatmapOverlay: React.FC<ThreatHeatmapOverlayProps> = ({ className }) => {
  return (
    <div className={cn(
      'absolute inset-0 pointer-events-none overflow-hidden',
      className
    )} style={{ opacity: 0.4 }}>
      {/* Threat zones with UI Atlas styling */}
      <div style={{
        position: 'absolute', top: '20%', left: '30%',
        width: '16rem', height: '16rem',
        backgroundColor: 'hsl(0 84% 60% / 0.2)',
        filter: 'blur(100px)',
        borderRadius: '50%'
      }} />
      <div style={{
        position: 'absolute', bottom: '30%', right: '25%',
        width: '20rem', height: '20rem',
        backgroundColor: 'hsl(0 84% 60% / 0.1)',
        filter: 'blur(120px)',
        borderRadius: '50%'
      }} />
      <div style={{
        position: 'absolute', top: '45%', right: '40%',
        width: '12rem', height: '12rem',
        backgroundColor: 'hsl(27 96% 61% / 0.15)',
        filter: 'blur(80px)',
        borderRadius: '50%'
      }} />
    </div>
  );
};

export { ThreatHeatmapOverlay };