"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import type { UserItem, UserStatus } from "../_lib/types";

type UserFormState = {
  id: string;
  trainer_name: string;
  trainer_code: string;
  email: string;
  role: string;
};

const emptyUserForm: UserFormState = {
  id: "",
  trainer_name: "",
  trainer_code: "",
  email: "",
  role: "user",
};

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function normalizeTrainerCode(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "");
  if (digits.length < 12) return null;
  const code = digits.slice(-12);
  return code.length === 12 ? code : null;
}

export default function AdminUsersPage() {
  const { userId, role: viewerRole } = useAdminAccess();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStatusHelpOpen, setIsStatusHelpOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserItem | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSearch = getActiveSearchTerm(search);

  const loadPageData = async () => {
    const { data, error } = await supabase.rpc("admin_list_users");

    if (error) {
      setFeedback(error.message);
      return;
    }

    setUsers((data as UserItem[] | null) ?? []);
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  const filteredUsers = useMemo(() => {
    if (!activeSearch) return users;

    return users.filter((user) =>
      [
        user.trainer_name ?? "",
        user.trainer_code,
        user.email ?? "",
        user.role,
        user.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(activeSearch),
    );
  }, [activeSearch, users]);

  const getUserLabel = (user: UserItem) => user.trainer_name?.trim() || `Trainer ${user.trainer_code}`;
  const getStatusLabel = (status: UserStatus) =>
    status === "active"
      ? "Active"
      : status === "pending"
        ? "Pending"
        : status === "provisional"
          ? "Provisional"
          : "Inactive";

  const resetForm = () => setUserForm(emptyUserForm);

  const stopScanner = useCallback(() => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!isCreateModalOpen || !isScannerOpen) {
      stopScanner();
      return;
    }

    const BarcodeDetectorApi = (
      window as Window & {
        BarcodeDetector?: BarcodeDetectorConstructor;
      }
    ).BarcodeDetector;

    if (!BarcodeDetectorApi) {
      setScannerError("This browser does not support QR scanning.");
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        scannerStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new BarcodeDetectorApi({ formats: ["qr_code"] });

        scannerIntervalRef.current = setInterval(async () => {
          if (!videoRef.current) return;

          try {
            const results = await detector.detect(videoRef.current);
            const rawValue = results[0]?.rawValue;
            if (!rawValue) return;

            const normalizedCode = normalizeTrainerCode(rawValue);
            if (!normalizedCode) {
              setScannerError("The QR does not contain a valid trainer code.");
              return;
            }

            setUserForm((prev) => ({ ...prev, trainer_code: normalizedCode }));
            setScannerError(null);
            setIsScannerOpen(false);
          } catch {
            setScannerError("Could not read the QR. Try moving the camera closer.");
          }
        }, 500);
      } catch {
        setScannerError("Could not open the camera.");
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [isCreateModalOpen, isScannerOpen, stopScanner]);

  const openEdit = (user: UserItem) => {
    setUserForm({
      id: user.id,
      trainer_name: user.trainer_name ?? "",
      trainer_code: user.trainer_code,
      email: user.email ?? "",
      role: user.role,
    });
    setIsCreateModalOpen(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setIsScannerOpen(false);
    setScannerError(null);
    stopScanner();
    resetForm();
  };

  const handleSave = async () => {
    if (!userForm.id || !userForm.trainer_code.trim()) {
      setFeedback("Enter the trainer code.");
      return;
    }

    if (userForm.role !== "user" && userForm.role !== "mod") {
      setFeedback("Only user or mod roles are allowed.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          trainer_name: userForm.trainer_name.trim() || null,
          trainer_code: userForm.trainer_code.trim(),
          email: userForm.email.trim().toLowerCase() || null,
          role: userForm.role,
        })
        .eq("id", userForm.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("Could not update the user.");
      }

      await loadPageData();
      setFeedback("User updated.");
      closeModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the user.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateProvisional = async () => {
    if (!userId || !userForm.trainer_code.trim()) {
      setFeedback("Enter the trainer code.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase.rpc("admin_create_provisional_user", {
        p_trainer_code: userForm.trainer_code.trim(),
        p_trainer_name: userForm.trainer_name.trim() || null,
        p_email: userForm.email.trim().toLowerCase() || null,
      });

      if (error) throw error;

      await loadPageData();
      setFeedback("Provisional user created.");
      closeCreateModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the provisional user.";
      setFeedback(
        message.includes("duplicate key") || message.includes("profiles_trainer_code_unique")
          ? "That trainer code already exists."
          : message,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetStatus = async (targetUserId: string, nextStatus: "active" | "inactive") => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase.rpc("admin_set_user_status", {
        target_user_id: targetUserId,
        next_status: nextStatus,
      });

      if (error) throw error;
      if (!data) {
        throw new Error("Could not update the user status.");
      }

      await loadPageData();
      setFeedback(
        nextStatus === "active" ? "User activated." : "User deactivated.",
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the user status.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="admin-box">
      <div className="admin-box-header admin-box-header-title">
        <h2 className="admin-subtitle admin-subtitle-no-margin">Users</h2>
        <button
          type="button"
          className="admin-mini-btn admin-mini-btn-provisional"
          onClick={() => {
            closeModal();
            resetForm();
            setScannerError(null);
            setIsCreateModalOpen(true);
          }}
          disabled={isSaving || !userId}
        >
          Agregar usuario provisorio
        </button>
      </div>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Search users"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Trainer</th>
              <th>Code</th>
              <th>Role</th>
              <th>
                <span className="admin-users-status-head">
                  <span>Status</span>
                  <button
                    type="button"
                    className="admin-status-help-trigger"
                    aria-label="Ver definicion de estados"
                    onClick={() => setIsStatusHelpOpen(true)}
                  >
                    ?
                  </button>
                </span>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{getUserLabel(user)}</td>
                <td>{user.trainer_code}</td>
                <td>{user.role}</td>
                <td>{getStatusLabel(user.status)}</td>
                <td>
                  {user.role !== "admin" ? (
                    <div className="admin-users-actions">
                      {user.status === "pending" ? (
                        <button
                          type="button"
                          className="admin-mini-btn"
                          onClick={() => handleSetStatus(user.id, "active")}
                          disabled={isSaving || !userId}
                        >
                          Approve
                        </button>
                      ) : null}
                      {user.status === "inactive" && viewerRole === "admin" ? (
                        <button
                          type="button"
                          className="admin-mini-btn"
                          onClick={() => handleSetStatus(user.id, "active")}
                          disabled={isSaving || !userId}
                        >
                          Activate
                        </button>
                      ) : null}
                      {user.status !== "inactive" ? (
                        <button
                          type="button"
                          className="admin-action-btn admin-action-btn-block"
                          onClick={() => setDeactivateTarget(user)}
                          disabled={isSaving || !userId}
                          aria-label={`Desactivar ${getUserLabel(user)}`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
                            <path d="M8.7 15.3 15.3 8.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="admin-action-btn admin-action-btn-edit"
                        aria-label={`Editar ${getUserLabel(user)}`}
                        onClick={() => openEdit(user)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                          <path
                            d="m3 17.25 9.06-9.06 3.75 3.75L6.75 21H3v-3.75Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen ? (
        <div className="admin-modal-backdrop" onClick={closeModal}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Edit user</h2>
              <button type="button" className="admin-icon-close" onClick={closeModal} aria-label="Cerrar">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <div className="admin-form">
              <input
                className="auth-input"
                placeholder="Trainer name"
                value={userForm.trainer_name}
                onChange={(event) =>
                  setUserForm((prev) => ({ ...prev, trainer_name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                placeholder="Trainer code"
                value={userForm.trainer_code}
                onChange={(event) =>
                  setUserForm((prev) => ({
                    ...prev,
                    trainer_code: event.target.value.replace(/\D/g, "").slice(0, 12),
                  }))
                }
              />
              <input
                className="auth-input"
                type="email"
                placeholder="Optional email"
                value={userForm.email}
                onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <select
                className="auth-input"
                value={userForm.role}
                onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="user">user</option>
                <option value="mod">mod</option>
              </select>
              <button className="access-button" type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <div className="admin-modal-backdrop" onClick={closeCreateModal}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Add provisional user</h2>
              <button type="button" className="admin-icon-close" onClick={closeCreateModal} aria-label="Cerrar">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <div className="admin-form">
              <p className="admin-muted admin-muted-small">
                Only the code is required. The profile stays provisional until the person links a real account.
              </p>
              <input
                className="auth-input"
                placeholder="Trainer code"
                value={userForm.trainer_code}
                onChange={(event) =>
                  setUserForm((prev) => ({
                    ...prev,
                    trainer_code: event.target.value.replace(/\D/g, "").slice(0, 12),
                  }))
                }
              />
              <button
                type="button"
                className="admin-mini-btn"
                onClick={() => {
                  setScannerError(null);
                  setIsScannerOpen((current) => !current);
                }}
              >
                {isScannerOpen ? "Close scanner" : "Scan QR"}
              </button>
              {isScannerOpen ? (
                <div className="admin-scanner-panel">
                  <video ref={videoRef} className="admin-scanner-video" muted playsInline />
                  {scannerError ? <p className="admin-error admin-error-small">{scannerError}</p> : null}
                </div>
              ) : null}
              <input
                className="auth-input"
                placeholder="Optional trainer name"
                value={userForm.trainer_name}
                onChange={(event) =>
                  setUserForm((prev) => ({ ...prev, trainer_name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                type="email"
                placeholder="Optional email"
                value={userForm.email}
                onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <button
                className="access-button"
                type="button"
                onClick={handleCreateProvisional}
                disabled={isSaving || !userId}
              >
                {isSaving ? "Saving..." : "Create provisional user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isStatusHelpOpen ? (
        <div className="admin-modal-backdrop" onClick={() => setIsStatusHelpOpen(false)}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">User statuses</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setIsStatusHelpOpen(false)}
                aria-label="Cerrar"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <div className="admin-status-help-copy">
              <p><strong>Active</strong></p>
              <p>puede usar la app</p>
              <p>tiene cuenta lista y autorizada</p>
              <p><strong>Pending</strong></p>
              <p>ya se registro y tiene lo necesario</p>
              <p>todavia espera aprobacion de moderacion</p>
              <p>solo pasa a Active cuando un mod/admin lo aprueba</p>
              <p><strong>Provisional</strong></p>
              <p>existe porque staff valido el trainer code</p>
              <p>todavia no tiene cuenta real en la plataforma</p>
              <p>cuando se registra, pasa a Active</p>
              <p><strong>Inactive</strong></p>
              <p>no puede usar la app</p>
              <p>conserva historial y registros</p>
              <p>puede venir desde Provisional, Pending o Active</p>
              <p>solo un admin puede devolverlo a Active</p>
            </div>
          </div>
        </div>
      ) : null}
      {deactivateTarget ? (
        <div className="admin-modal-backdrop" onClick={() => setDeactivateTarget(null)}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Deactivate</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setDeactivateTarget(null)}
                aria-label="Cerrar"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.41 1.42Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <p className="admin-muted">
              Are you sure you want to deactivate <strong>{getUserLabel(deactivateTarget)}</strong>?
            </p>
            <div className="admin-confirm-actions">
              <button type="button" className="admin-mini-btn" onClick={() => setDeactivateTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-mini-btn danger"
                onClick={async () => {
                  await handleSetStatus(deactivateTarget.id, "inactive");
                  setDeactivateTarget(null);
                }}
                disabled={isSaving || !userId}
              >
                {isSaving ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

