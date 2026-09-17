// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePortalSession, PORTAL_LOGIN_PATH, PORTAL_LOGOUT_FAILED_PATH } from "@/hooks/use-portal-session";
import { PortalError, fetchSession, logout } from "@/lib/portal-api";
import { captureNavigation, restoreNavigation } from "@/test/location";

vi.mock("@/lib/portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-api")>()),
  fetchSession: vi.fn(),
  logout: vi.fn(),
}));

afterEach(() => {
  cleanup();
  restoreNavigation();
  vi.resetAllMocks();
});

it.each([0, 403, 500])("leaves the workspace but reports failed logout (%s)", async (status) => {
  vi.mocked(fetchSession).mockResolvedValue({ email: "office@example.invalid", shelters: [] });
  vi.mocked(logout).mockRejectedValue(new PortalError(status));
  const replace = captureNavigation();
  const { result } = renderHook(usePortalSession);
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  await act(async () => { await result.current.signOut(); });
  expect(replace).toHaveBeenCalledWith(PORTAL_LOGOUT_FAILED_PATH);
});

it.each([204, 401])("leaves without a failure notice when logged out (%s)", async (status) => {
  vi.mocked(fetchSession).mockResolvedValue({ email: "office@example.invalid", shelters: [] });
  if (status === 401) vi.mocked(logout).mockRejectedValue(new PortalError(401));
  else vi.mocked(logout).mockResolvedValue(undefined);
  const replace = captureNavigation();
  const { result } = renderHook(usePortalSession);
  await waitFor(() => expect(result.current.state.status).toBe("ready"));
  await act(async () => { await result.current.signOut(); });
  expect(replace).toHaveBeenCalledWith(PORTAL_LOGIN_PATH);
});
