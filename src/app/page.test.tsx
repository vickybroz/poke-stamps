import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";

const { mockPush, mockSignInWithPassword, mockSingle } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("next/font/google", () => ({
  Press_Start_2P: () => ({
    className: "mock-font",
  }),
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
      signInWithPassword: mockSignInWithPassword,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSingle,
        }),
      }),
    }),
  },
}));

describe("Home login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in and redirects admin users to /admin", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: "admin", active: true }, error: null });

    render(<Home />);

    const user = userEvent.setup();
    const enterButton = screen.getByRole("button", { name: "Entrar" });
    expect(enterButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Correo"), "test@poke.com");
    await user.type(screen.getByPlaceholderText("Contrasena"), "12345678");
    expect(enterButton).toBeEnabled();

    await user.click(enterButton);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "test@poke.com",
        password: "12345678",
      });
      expect(mockPush).toHaveBeenCalledWith("/admin");
    });
  });

  it("logs in and redirects standard users to /user", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "user-2" } }, error: null });
    mockSingle.mockResolvedValue({ data: { role: "user", active: true }, error: null });

    render(<Home />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Correo"), "user@poke.com");
    await user.type(screen.getByPlaceholderText("Contrasena"), "12345678");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/user");
    });
  });
});
