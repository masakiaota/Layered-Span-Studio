import { useEffect, useRef, useState } from "react";
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
  const authRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++authRequestIdRef.current;
    setLoading(true);
    setError("");
    void api
      .getSession()
      .then((response) => {
        if (authRequestIdRef.current !== requestId) {
          return;
        }
        setUser(response);
      })
      .catch((sessionError) => {
        if (authRequestIdRef.current !== requestId) {
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
        if (authRequestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, []);

  async function login(username: string, password: string) {
    const requestId = ++authRequestIdRef.current;
    setError("");
    setLoading(true);
    try {
      const sessionUser = await api.createSession(username, password);
      if (authRequestIdRef.current !== requestId) {
        return false;
      }
      setUser(sessionUser);
      return true;
    } catch (loginError) {
      if (authRequestIdRef.current !== requestId) {
        return false;
      }
      setUser(null);
      setError(loginError instanceof Error ? loginError.message : "ログインに失敗した");
      return false;
    } finally {
      if (authRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function logout() {
    const requestId = ++authRequestIdRef.current;
    setError("");
    setLoading(true);
    try {
      await api.deleteSession();
    } catch (logoutError) {
      if (authRequestIdRef.current !== requestId) {
        return;
      }
      setError(logoutError instanceof Error ? logoutError.message : "ログアウトに失敗した");
    } finally {
      if (authRequestIdRef.current === requestId) {
        setUser(null);
        setLoading(false);
      }
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
