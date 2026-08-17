import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
  QueryKey,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface UserPreferenceValue {
  key: string;
  value: string | null;
}

// ---------------------------------------------------------------------------
// GET /api/user-preferences/:key
// ---------------------------------------------------------------------------

export const getUserPreferenceUrl = (key: string) =>
  `/api/user-preferences/${encodeURIComponent(key)}`;

export const getUserPreferenceQueryKey = (key: string) =>
  [getUserPreferenceUrl(key)] as const;

export const getUserPreference = async (
  key: string,
  options?: Parameters<typeof customFetch>[1],
): Promise<UserPreferenceValue> =>
  customFetch<UserPreferenceValue>(getUserPreferenceUrl(key), {
    ...options,
    method: "GET",
  });

type UserPrefQueryOptions<TData, TError> = Omit<
  UseQueryOptions<Awaited<ReturnType<typeof getUserPreference>>, TError, TData>,
  "queryKey" | "queryFn"
>;

export const getUserPreferenceQueryOptions = <
  TData = Awaited<ReturnType<typeof getUserPreference>>,
  TError = unknown,
>(
  key: string,
  options?: {
    query?: UserPrefQueryOptions<TData, TError>;
    request?: Parameters<typeof customFetch>[1];
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = getUserPreferenceQueryKey(key);
  const queryFn = ({ signal }: { signal?: AbortSignal }) =>
    getUserPreference(key, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getUserPreference>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useGetUserPreference<
  TData = Awaited<ReturnType<typeof getUserPreference>>,
  TError = unknown,
>(
  key: string,
  options?: {
    query?: UserPrefQueryOptions<TData, TError>;
    request?: Parameters<typeof customFetch>[1];
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getUserPreferenceQueryOptions(key, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
  };
  query.queryKey = queryOptions.queryKey;
  return query;
}

// ---------------------------------------------------------------------------
// PUT /api/user-preferences/:key
// ---------------------------------------------------------------------------

export const putUserPreference = async (
  key: string,
  value: string,
  options?: Parameters<typeof customFetch>[1],
): Promise<UserPreferenceValue> =>
  customFetch<UserPreferenceValue>(getUserPreferenceUrl(key), {
    ...options,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify({ value }),
  });

export const getPutUserPreferenceMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof putUserPreference>>,
    TError,
    { key: string; value: string },
    TContext
  >;
  request?: Parameters<typeof customFetch>[1];
}): UseMutationOptions<
  Awaited<ReturnType<typeof putUserPreference>>,
  TError,
  { key: string; value: string },
  TContext
> => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn = ({ key, value }: { key: string; value: string }) =>
    putUserPreference(key, value, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function usePutUserPreference<TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof putUserPreference>>,
      TError,
      { key: string; value: string },
      TContext
    >;
    request?: Parameters<typeof customFetch>[1];
  },
): UseMutationResult<
  Awaited<ReturnType<typeof putUserPreference>>,
  TError,
  { key: string; value: string },
  TContext
> {
  return useMutation(getPutUserPreferenceMutationOptions(options));
}

// ---------------------------------------------------------------------------
// DELETE /api/user-preferences/:key
// ---------------------------------------------------------------------------

export const deleteUserPreference = async (
  key: string,
  options?: Parameters<typeof customFetch>[1],
): Promise<{ message: string }> =>
  customFetch<{ message: string }>(getUserPreferenceUrl(key), {
    ...options,
    method: "DELETE",
  });

export const getDeleteUserPreferenceMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof deleteUserPreference>>,
    TError,
    { key: string },
    TContext
  >;
  request?: Parameters<typeof customFetch>[1];
}): UseMutationOptions<
  Awaited<ReturnType<typeof deleteUserPreference>>,
  TError,
  { key: string },
  TContext
> => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn = ({ key }: { key: string }) =>
    deleteUserPreference(key, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function useDeleteUserPreference<TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof deleteUserPreference>>,
      TError,
      { key: string },
      TContext
    >;
    request?: Parameters<typeof customFetch>[1];
  },
): UseMutationResult<
  Awaited<ReturnType<typeof deleteUserPreference>>,
  TError,
  { key: string },
  TContext
> {
  return useMutation(getDeleteUserPreferenceMutationOptions(options));
}
