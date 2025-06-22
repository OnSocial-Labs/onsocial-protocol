import { useState, useEffect } from 'react';
import { getToken } from '../storage';

export function useAuth() {
  const [jwt, setJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getToken()
      .then((token) => setJwt(token))
      .catch(() => setJwt(null))
      .finally(() => setLoading(false));
  }, []);

  return { jwt, loading };
}
