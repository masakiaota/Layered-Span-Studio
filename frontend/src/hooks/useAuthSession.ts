import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api";
import { throwIfAborted } from "../query/queryAbort";
import { queryKeys } from "../query/queryKeys";

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

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(),
    queryFn: ({ signal }) => fetchSession(signal),
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => api.createSession(username, password),
    onMutate: async () => {
      setActionError("");
      await queryClient.cancelQueries({ queryKey: queryKeys.session() });
    },
    onSuccess: (sessionUser) => {
      queryClient.setQueryData(queryKeys.session(), sessionUser);
    },
    onError: (error) => {
      queryClient.setQueryData(queryKeys.session(), null);
      setActionError(getErrorMessage(error, "ログインに失敗した"));
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.deleteSession(),
    onMutate: async () => {
      setActionError("");
      await queryClient.cancelQueries({ queryKey: queryKeys.session() });
      queryClient.setQueryData(queryKeys.session(), null);
    },
    onError: (error) => {
      setActionError(getErrorMessage(error, "ログアウトに失敗した"));
    },
    onSettled: () => {
      queryClient.setQueryData(queryKeys.session(), null);
    },
  });

  async function login(username: string, password: string) {
    try {
      await loginMutation.mutateAsync({ username, password });
      return true;
    } catch {
      return false;
    }
  }

  async function logout() {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // error state is managed by the mutation
    }
  }

  return {
    user: sessionQuery.data ?? null,
    loading: sessionQuery.isPending || loginMutation.isPending || logoutMutation.isPending,
    error: actionError || (sessionQuery.error instanceof Error ? sessionQuery.error.message : ""),
    login,
    logout,
  };
}
