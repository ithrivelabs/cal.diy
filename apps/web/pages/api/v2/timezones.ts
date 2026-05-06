import { cityTimezonesHandler } from "@calcom/features/cityTimezones/cityTimezonesHandler";
import { SUCCESS_STATUS } from "@calcom/platform-constants";
import type { ApiResponse } from "@calcom/platform-types";
import type { NextApiHandler } from "next";
import type { NextApiRequest, NextApiResponse } from "next";

type TimezonesResponse = ApiResponse<Awaited<ReturnType<typeof cityTimezonesHandler>>>;

const handler: NextApiHandler<TimezonesResponse | { error: string }> = async (
  req: NextApiRequest,
  res: NextApiResponse<TimezonesResponse | { error: string }>
) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const timezones = await cityTimezonesHandler();
  return res.status(200).json({
    status: SUCCESS_STATUS,
    data: timezones,
  });
};

export default handler;
