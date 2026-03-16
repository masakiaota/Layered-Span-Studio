import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import type { UserRecord } from "../types";

function getErrorStatus(error: unknown): number | null {
  if (error instanceof ApiError) {
    return error.status;
  }
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  if (error && typeof error === "object" && "cause" in error) {
    const cause = error.cause;
    if (cause && typeof cause === "object" && "status" in cause && typeof cause.status === "number") {
      return cause.status;
    }
  }
  return null;
}

export function useAuthSession() {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .getSession()
      .then((response) => {
        if (!active) {
          return;
        }
        setUser(response);
      })
      .catch((sessionError) => {
        if (!active) {
          return;
        }
        setUser(null);
        if (getErrorStatus(sessionError) !== 401 && sessionError instanceof Error) {
          setError(sessionError.message);
          return;
        }
        setError("");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function login(username: string, password: string) {
    setError("");
    setLoading(true);
    try {
      const sessionUser = await api.createSession(username, password);
      setUser(sessionUser);
      return true;
    } catch (loginError) {
      setUser(null);
      setError(loginError instanceof Error ? loginError.message : "ログインに失敗した");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setError("");
    setLoading(true);
    try {
      await api.deleteSession();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "ログアウトに失敗した");
    } finally {
      setUser(null);
      setLoading(false);
    }
  }

  return {
    user,
    loading,
    error,
    login,
    logout,
  };
}
