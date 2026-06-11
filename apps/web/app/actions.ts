"use server";

export interface RequestTrackingActionResult {
  status: "already_tracked";
  message: string;
}

export async function requestTrackingAction(): Promise<RequestTrackingActionResult> {
  return {
    status: "already_tracked",
    message: "已追踪，后台会继续按缺集状态检查。",
  };
}
