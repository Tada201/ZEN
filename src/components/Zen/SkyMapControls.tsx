import React from 'react';
import { Compass, Target, Navigation, Layers, ZoomIn, ZoomOut, Settings } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface SkyMapControlsProps {
    className?: string;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onCenter?: () => void;
}

export function SkyMapControls({ className, onZoomIn, onZoomOut, onCenter }: SkyMapControlsProps) {
    return (
        <div className={cn('flex flex-col gap-2 pointer-events-auto', className)}>
            {/* Main Navigation Group */}
            <div className="flex flex-col rounded-lg bg-card/90 backdrop-blur-md border border-border shadow-2xl overflow-hidden">
                <button
                    onClick={onCenter}
                    className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all border-b border-border"
                    title="Center View"
                >
                    <Target size={18} />
                </button>
                <button
                    onClick={onZoomIn}
                    className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all border-b border-border"
                    title="Zoom In"
                >
                    <ZoomIn size={18} />
                </button>
                <button
                    onClick={onZoomOut}
                    className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                    title="Zoom Out"
                >
                    <ZoomOut size={18} />
                </button>
            </div>

            {/* Utility Group */}
            <div className="flex flex-col rounded-lg bg-card/90 backdrop-blur-md border border-border shadow-2xl overflow-hidden">
                <button
                    className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all border-b border-border"
                    title="Toggle Layers"
                >
                    <Layers size={18} />
                </button>
                <button
                    className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all border-b border-border"
                    title="Celestial Tracking"
                >
                    <Navigation size={18} />
                </button>
                <button
                    className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                    title="Map Settings"
                >
                    <Settings size={18} />
                </button>
            </div>

            {/* Compass */}
            <div className="w-12 h-12 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-2xl flex items-center justify-center group cursor-pointer hover:border-primary/40 transition-colors mt-2">
                <Compass size={22} className="text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
        </div>
    );
}
