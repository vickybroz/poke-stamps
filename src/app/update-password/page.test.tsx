import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UpdatePasswordPage from "./page";

const { mockGetSession, mockUpdateUser } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: unknown;
    href: string;
    className?: string;
  }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      updateUser: mockUpdateUser,
    },
  },
}));

describe("UpdatePasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides password inputs after successful update", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "1" } } } });
    mockUpdateUser.mockResolvedValue({ error: null });

    render(<UpdatePasswordPage />);

    const user = userEvent.setup();
    const newPasswordInput = await screen.findByPlaceholderText("Nueva contrasena");
    const confirmPasswordInput = screen.getByPlaceholderText("Confirmar contrasena");

    await user.type(newPasswordInput, "newPassword123");
    await user.type(confirmPasswordInput, "newPassword123");
    await user.click(
      screen.getByRole("button", { name: "Actualizar contrasena" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Contrasena actualizada. Ya puedes iniciar sesion."),
      ).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Nueva contrasena")).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Confirmar contrasena"),
      ).not.toBeInTheDocument();
    });
  });
});
