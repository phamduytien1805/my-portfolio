'use client';

import { trackEvent } from '@/lib/analytics';
import { useEffect } from 'react';

// Visit duration for Vercel Analytics: an "active_time" event each time a visitor passes a
// milestone, counting only while the tab is visible (a tab left in the background doesn't
// count). The Events tab then shows how many visits reached 10 s, 30 s, 1 min… Sent along the
// way rather than on leaving, which browsers often cut short.
const MILESTONES: [seconds: number, label: string][] = [
  [10, '10s'],
  [30, '30s'],
  [60, '1m'],
  [180, '3m'],
  [600, '10m'],
];

export function EngagementTracker() {
  useEffect(() => {
    let seconds = 0;
    let next = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || next >= MILESTONES.length)
        return;
      seconds += 1;
      const [at, label] = MILESTONES[next];
      if (seconds >= at) {
        trackEvent('active_time', { reached: label });
        next += 1;
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
