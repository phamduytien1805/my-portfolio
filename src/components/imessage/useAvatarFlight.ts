'use client';

import { animate, type AnimationPlaybackControls } from 'framer-motion';
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { sharedTransition } from './ImessageChat';

const RESTING_STYLE = 'width:100%;height:100%';

/**
 * Moves one live avatar between its spot on the home page and the chat header.
 *
 * The avatar is rendered once (portal into the returned `host`) and the host element itself is
 * moved: it lifts into a fixed layer and flies with transforms only, so the 3D scene never
 * reloads mid-transition (rebuilding it is what made the flight stutter).
 */
export function useAvatarFlight(
  open: boolean,
  homeSlot: RefObject<HTMLElement | null>,
  headerSlot: RefObject<HTMLElement | null>,
  reduceMotion: boolean
) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.style.cssText = RESTING_STYLE;
    setHost(el);
    return () => el.remove();
  }, []);

  useLayoutEffect(() => {
    const home = homeSlot.current;
    if (!host || !home) return;
    const flying = host.parentElement === document.body;

    // Never opened (or already home): just sit in the home slot.
    if (!open && !flying) {
      if (host.parentElement !== home) home.appendChild(host);
      return;
    }

    const transition = reduceMotion ? { duration: 0 } : sharedTransition;
    let controls: AnimationPlaybackControls | undefined;
    let cancelled = false;

    // The fixed layer is anchored on the home slot; x/y/scale carry it to the header.
    const anchor = () => {
      const r = home.getBoundingClientRect();
      const size = home.offsetWidth;
      Object.assign(host.style, {
        position: 'fixed',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${size}px`,
        height: `${size}px`,
        zIndex: '70',
        transformOrigin: '0 0',
      });
      return { r, size };
    };
    const headerTarget = () => {
      const { r, size } = anchor();
      const to = headerSlot.current?.getBoundingClientRect();
      return to
        ? { x: to.left - r.left, y: to.top - r.top, scale: to.width / size }
        : { x: 0, y: 0, scale: 1 };
    };

    if (open) {
      if (!flying) document.body.appendChild(host);
      controls = animate(host, headerTarget(), transition);
      // Keep it on the header if the window changes size.
      const onResize = () => {
        controls?.stop();
        controls = animate(host, headerTarget(), { duration: 0 });
      };
      window.addEventListener('resize', onResize);
      // …and when the chat's header moves without a window resize (it makes room for a
      // website opened beside it). The first callback is just the initial measurement.
      let first = true;
      const header = headerSlot.current?.closest('header');
      const headerObserver = new ResizeObserver(() => {
        if (first) first = false;
        else onResize();
      });
      if (header) headerObserver.observe(header);
      return () => {
        window.removeEventListener('resize', onResize);
        headerObserver.disconnect();
        controls?.stop();
      };
    }

    // Closing: fly back, then drop into the page again.
    anchor();
    const flyBack = animate(host, { x: 0, y: 0, scale: 1 }, transition);
    controls = flyBack;
    flyBack.then(() => {
      if (cancelled) return;
      host.style.cssText = RESTING_STYLE;
      home.appendChild(host);
    });
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [open, host, homeSlot, headerSlot, reduceMotion]);

  return host;
}
