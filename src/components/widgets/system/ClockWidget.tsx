import { useState, useEffect, memo } from 'react';

export const ClockWidget = memo(function ClockWidget() {
    const [time, setTime] = useState({ h: '--', m: '--', s: '--' });

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setTime({
                h: now.getHours().toString().padStart(2, '0'),
                m: now.getMinutes().toString().padStart(2, '0'),
                s: now.getSeconds().toString().padStart(2, '0'),
            });
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="widget-clock">
            <span className="widget-clock__digit">{time.h}</span>
            <span className="widget-clock__sep">:</span>
            <span className="widget-clock__digit">{time.m}</span>
            <span className="widget-clock__sep">:</span>
            <span className="widget-clock__digit">{time.s}</span>
        </div>
    );
}, () => true);
