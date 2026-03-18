import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api";
import { throwIfAborted } from "../query/queryAbort";
import { queryKeys } from "../query/queryKeys";
import type { UserRecord } from "../types";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function fetchSession(signal: AbortSignal) {
  throwIfAborted(signal);
  try {
    const response = await api.getSession(signal);
    throwIfAborted(signal);
    return response;
  } catch (error) {
    if (signal.aborted) {
      throwIfAborted(signal);
    }
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function useAuthSession() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const [sessionUser, setSessionUser] = useState<UserRecord | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const sessionKey = useMemo(() => queryKeys.session(sessionVersion), [sessionVersion]);

  const sessionQuery = useQuery<UserRecord | null>({
    queryKey: sessionKey,
    queryFn: ({ signal }) => fetchSession(signal),
  });

  const loginMutation = useMutation({
    mutationFn: async ({
      username,
      password,
    }: {
      username: string;
      password: string;
      targetSessionKey: ReturnType<typeof queryKeys.session>;
    }) => {
      return api.createSession(username, password);
    },
    onMutate: () => {
      setActionError("");
    },
    onSuccess: (nextUser, variables) => {
      queryClient.setQueryData(variables.targetSessionKey, nextUser);
    },
    onError: (error, variables) => {
      setSessionUser(null);
      queryClient.setQueryData(variables.targetSessionKey, null);
      setActionError(getErrorMessage(error, "ログインに失敗した"));
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async ({ targetSessionKey }: { targetSessionKey: ReturnType<typeof queryKeys.session> }) => {
      await api.deleteSession();
      return targetSessionKey;
    },
    onMutate: () => {
      setActionError("");
      setSessionUser(null);
    },
    onError: (error) => {
      setActionError(getErrorMessage(error, "ログアウトに失敗した"));
    },
    onSettled: (_data, _error, variables) => {
      queryClient.setQueryData(variables.targetSessionKey, null);
    },
  });

  useEffect(() => {
    if (loginMutation.isPending || logoutMutation.isPending || sessionQuery.isPending) {
      return;
    }
    setSessionUser(sessionQuery.data ?? null);
  }, [loginMutation.isPending, logoutMutation.isPending, sessionQuery.data, sessionQuery.isPending]);

  async function login(username: string, password: string) {
    const nextSessionVersion = sessionVersion + 1;
    const targetSessionKey = queryKeys.session(nextSessionVersion);
    setSessionVersion(nextSessionVersion);
    await queryClient.cancelQueries({ queryKey: queryKeys.sessionPrefix() });
    try {
      const nextUser = await loginMutation.mutateAsync({ username, password, targetSessionKey });
      setSessionUser(nextUser);
      return true;
    } catch {
      return false;
    }
  }

  async function logout() {
    const nextSessionVersion = sessionVersion + 1;
    const targetSessionKey = queryKeys.session(nextSessionVersion);
    setSessionVersion(nextSessionVersion);
    await queryClient.cancelQueries({ queryKey: queryKeys.sessionPrefix() });
    try {
      await logoutMutation.mutateAsync({ targetSessionKey });
    } catch {
      // error state is managed by the mutation
    }
  }

  return {
    user: sessionUser,
    loading: sessionQuery.isPending || loginMutation.isPending || logoutMutation.isPending,
    error: actionError || (sessionUser ? "" : sessionQuery.error instanceof Error ? sessionQuery.error.message : ""),
    login,
    logout,
  };
}
