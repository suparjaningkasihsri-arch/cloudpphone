'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { AppState } from './types';

// Mengambil status terbaru secara berkala selama tab terlihat.
export function useLiveState(intervalMs = 3000) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await api<AppState>('/api/state');
      if (alive.current) {
        setState(next);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Gagal memuat data');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      if (document.visibilityState === 'visible') await load();
      if (alive.current) timer.current = setTimeout(tick, intervalMs);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, intervalMs]);

  return { state, error, refresh: load };
}
