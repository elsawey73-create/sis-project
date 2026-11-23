import { useEffect, useState } from 'react';
import api from '../api/axios';

// Simple GET. Returns { data, error, loading, reload }.
export default function useFetch(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    api
      .get(url)
      .then((r) => alive && (setData(r.data), setError(null)))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [url, tick]);

  return { data, error, loading, reload: () => setTick((x) => x + 1) };
}
