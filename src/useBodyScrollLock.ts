import { useEffect } from 'react';

let lockCount = 0;
let lockedScrollY = 0;
let savedBodyStyle: { position: string; top: string; width: string; overflow: string } | undefined;

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const body = document.body;
    if (lockCount++ === 0) {
      lockedScrollY = window.scrollY;
      savedBodyStyle = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
      body.style.position = 'fixed';
      body.style.top = `-${lockedScrollY}px`;
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    }
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0 || !savedBodyStyle) return;
      body.style.position = savedBodyStyle.position;
      body.style.top = savedBodyStyle.top;
      body.style.width = savedBodyStyle.width;
      body.style.overflow = savedBodyStyle.overflow;
      window.scrollTo(0, lockedScrollY);
      savedBodyStyle = undefined;
    };
  }, [locked]);
}
