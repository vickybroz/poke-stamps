"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import type { UserItem } from "../_lib/types";

type UserFormState = {
  id: string;
  trainer_name: string;
  trainer_code: string;
  role: string;
  active: boolean;
};

export default function AdminUsersPage() {
  const { userId } = useAdminAccess();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>({
    id: "",
    trainer_name: "",
    trainer_code: "",
    role: "user",
    active: true,
  });

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
      [user.trainer_name, user.trainer_code, user.role, user.active ? "activo" : "pendiente"]
        .join(" ")
        .toLowerCase()
        .includes(activeSearch),
    );
  }, [activeSearch, users]);

  const openEdit = (user: UserItem) => {
    setUserForm({
      id: user.id,
      trainer_name: user.trainer_name,
      trainer_code: user.trainer_code,
      role: user.role,
      active: user.active,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setUserForm({
      id: "",
      trainer_name: "",
      trainer_code: "",
      role: "user",
      active: true,
    });
  };

  const handleSave = async () => {
    if (!userForm.id || !userForm.trainer_name.trim() || !userForm.trainer_code.trim()) {
      setFeedback("Completa el nombre y el codigo del entrenador.");
      return;
    }

    if (userForm.role !== "user" && userForm.role !== "mod") {
      setFeedback("Solo puedes asignar los roles user o mod.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          trainer_name: userForm.trainer_name.trim(),
          trainer_code: userForm.trainer_code.trim(),
          role: userForm.role,
          active: userForm.active,
        })
        .eq("id", userForm.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("No se pudo actualizar el usuario.");
      }

      await loadPageData();
      setFeedback("Usuario actualizado.");
      closeModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo actualizar el usuario.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async (targetUserId: string) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ active: true })
        .eq("id", targetUserId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("No se pudo autorizar el usuario.");
      }

      await loadPageData();
      setFeedback("Usuario autorizado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo autorizar el usuario.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase.rpc("admin_delete_user", {
        target_user_id: deleteTarget.id,
      });

      if (error) throw error;

      await loadPageData();
      setFeedback("Usuario eliminado.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar el usuario.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="admin-box">
      <h2 className="admin-subtitle">Usuarios</h2>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar en usuarios"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Entrenador</th>
              <th>Codigo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.trainer_name}</td>
                <td>{user.trainer_code}</td>
                <td>{user.role}</td>
                <td>{user.active ? "Activo" : "Pendiente"}</td>
                <td>
                  {user.role !== "admin" ? (
                  <div className="admin-users-actions">
                    {!user.active ? (
                      <button
                        type="button"
                        className="admin-mini-btn"
                        onClick={() => handleApprove(user.id)}
                        disabled={isSaving || !userId}
                      >
                        Autorizar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-action-btn admin-action-btn-edit"
                      aria-label={`Editar ${user.trainer_name}`}
                      onClick={() => openEdit(user)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                        <path
                          d="m3 17.25 9.06-9.06 3.75 3.75L6.75 21H3v-3.75Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="admin-action-btn admin-action-btn-delete"
                      aria-label={`Borrar ${user.trainer_name}`}
                      onClick={() => setDeleteTarget(user)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                        <path
                          d="M9 3h6l1 1h4v2H4V4h4l1-1Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 7h12l-1 14H7L6 7Z"
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
              <h2 className="admin-box-title">Editar usuario</h2>
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
                placeholder="Nombre del entrenador"
                value={userForm.trainer_name}
                onChange={(event) =>
                  setUserForm((prev) => ({ ...prev, trainer_name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                placeholder="Codigo del entrenador"
                value={userForm.trainer_code}
                onChange={(event) =>
                  setUserForm((prev) => ({
                    ...prev,
                    trainer_code: event.target.value.replace(/\D/g, "").slice(0, 12),
                  }))
                }
              />
              <select
                className="auth-input"
                value={userForm.role}
                onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="user">user</option>
                <option value="mod">mod</option>
              </select>
              <label className="admin-check-item">
                <input
                  type="checkbox"
                  checked={userForm.active}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, active: event.target.checked }))
                  }
                />
                <span>Usuario activo</span>
              </label>
              <button className="access-button" type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="admin-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Eliminar</h2>
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setDeleteTarget(null)}
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
              Seguro que quieres borrar <strong>{deleteTarget.trainer_name}</strong>?
            </p>
            <div className="admin-confirm-actions">
              <button type="button" className="admin-mini-btn" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="admin-mini-btn danger"
                onClick={handleDelete}
                disabled={isSaving || !userId}
              >
                {isSaving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}



