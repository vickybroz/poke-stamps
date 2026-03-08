import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";

const {
  mockPush,
  mockSignInWithPassword,
  mockSignOut,
  mockSingle,
  mockMaybeSingle,
  mockSignUp,
  mockInsert,
  mockUpdateEq,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockSingle: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockSignUp: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdateEq: vi.fn(),
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
      signOut: mockSignOut,
      signUp: mockSignUp,
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: mockSingle,
              maybeSingle: mockMaybeSingle,
            }),
          }),
          insert: mockInsert,
          update: () => ({
            eq: mockUpdateEq,
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            single: mockSingle,
            maybeSingle: mockMaybeSingle,
          }),
        }),
      };
    },
  },
}));

describe("Home login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
});

  it("logs in and redirects admin users to /admin", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
    mockSingle.mockResolvedValue({
      data: { id: "profile-1", trainer_name: "Vicky", trainer_code: "123456789012", role: "admin", status: "active", active: true },
      error: null,
    });

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
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "auth-2" } }, error: null });
    mockSingle.mockResolvedValue({
      data: { id: "profile-2", trainer_name: "User", trainer_code: "123456789012", role: "user", status: "active", active: true },
      error: null,
    });

    render(<Home />);

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Correo"), "user@poke.com");
    await user.type(screen.getByPlaceholderText("Contrasena"), "12345678");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/user");
    });
  });

  it("creates a pending signup request", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: "auth-3" } }, error: null });

    render(<Home />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Registrarme" }));
    await user.type(screen.getByPlaceholderText("Nombre de entrenador"), "Vicky");
    await user.type(screen.getByPlaceholderText("Codigo de entrenador"), "123456789012");
    await user.type(screen.getByPlaceholderText("Correo"), "new@poke.com");
    await user.type(screen.getByPlaceholderText("Contrasena"), "12345678");
    await user.click(screen.getByRole("button", { name: "Solicitar acceso" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "new@poke.com",
        password: "12345678",
      });
      expect(mockInsert).toHaveBeenCalledWith({
        auth_user_id: "auth-3",
        trainer_name: "Vicky",
        trainer_code: "123456789012",
        email: "new@poke.com",
        role: "user",
        status: "pending",
      });
      expect(
        screen.getByText("Tu solicitud fue enviada. Podras acceder cuando un mod acepte tu acceso."),
      ).toBeInTheDocument();
    });
  });

  it("links a provisional profile and activates it on signup", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: "auth-4" } }, error: null });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "profile-provisional",
        trainer_name: "Existing Trainer",
        auth_user_id: null,
        status: "provisional",
      },
      error: null,
    });

    render(<Home />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Registrarme" }));
    await user.type(screen.getByPlaceholderText("Nombre de entrenador"), "Ignored Name");
    await user.type(screen.getByPlaceholderText("Codigo de entrenador"), "123456789012");
    await user.type(screen.getByPlaceholderText("Correo"), "provisional@poke.com");
    await user.type(screen.getByPlaceholderText("Contrasena"), "12345678");
    await user.click(screen.getByRole("button", { name: "Solicitar acceso" }));

    await waitFor(() => {
      expect(mockUpdateEq).toHaveBeenCalledWith("id", "profile-provisional");
      expect(mockInsert).not.toHaveBeenCalled();
      expect(screen.getByText("Tu cuenta fue vinculada correctamente. Ya puedes iniciar sesion.")).toBeInTheDocument();
    });
  });

  it("links an inactive profile without reactivating it on signup", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: "auth-5" } }, error: null });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "profile-inactive",
        trainer_name: "Inactive Trainer",
        auth_user_id: null,
        status: "inactive",
      },
      error: null,
    });

    render(<Home />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Registrarme" }));
    await user.type(screen.getByPlaceholderText("Nombre de entrenador"), "Ignored Name");
    await user.type(screen.getByPlaceholderText("Codigo de entrenador"), "123456789012");
    await user.type(screen.getByPlaceholderText("Correo"), "inactive@poke.com");
    await user.type(screen.getByPlaceholderText("Contrasena"), "12345678");
    await user.click(screen.getByRole("button", { name: "Solicitar acceso" }));

    await waitFor(() => {
      expect(mockUpdateEq).toHaveBeenCalledWith("id", "profile-inactive");
      expect(screen.getByText("Tu cuenta fue vinculada, pero sigue inactive. Solo un admin puede volverla a Active.")).toBeInTheDocument();
    });
  });
});
