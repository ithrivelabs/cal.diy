import { SUCCESS_STATUS } from "@calcom/platform-constants";
import type { ApiResponse } from "@calcom/platform-types";
import { useQuery } from "@tanstack/react-query";
import http from "../lib/http";

type Timezones = { city: string; timezone: string }[];
const useGetCityTimezones = (): { isLoading: boolean; data: Timezones | undefined } => {
  // In web app mode, atoms HTTP client may not have a base URL configured.
  // Fallback to Next.js API v2 proxy to avoid hitting `/timezones` (404).
  let pathname = "/api/v2/timezones";
  if (http?.getUrl()) {
    pathname = "/timezones";
  }

  const { isLoading, data } = useQuery<Timezones>({
    queryKey: ["city-timezones"],
    queryFn: () => {
      return http?.get<ApiResponse<Timezones>>(pathname).then((res) => {
        if (res.data.status === SUCCESS_STATUS) {
          return res.data.data;
        }
        throw new Error(res.data.error.message);
      });
    },
  });

  return { isLoading, data };
};

export default useGetCityTimezones;
