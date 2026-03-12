import { useEffect, useState } from "react";
import { api } from "../api";
import type { UserRecord } from "../types";

const TOKEN_KEY = "layered-span-studio/token";

export function useAuthSession() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void api
      .getMe(token)
      .then((response) => {
        if (!active) {
          return;
        }
        setUser(response);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        if (!active) {
          return;
        }
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function login(username: string, password: string) {
    setError("");
    setLoading(true);
    try {
      const response = await api.login(username, password);
      localStorage.setItem(TOKEN_KEY, response.access_token);
      setToken(response.access_token);
      const me = await api.getMe(response.access_token);
      setUser(me);
      return true;
    } catch (loginError) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setError(loginError instanceof Error ? loginError.message : "ログインに失敗した");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setError("");
  }

  return {
    token,
    user,
    loading,
    error,
    login,
    logout,
  };
}
