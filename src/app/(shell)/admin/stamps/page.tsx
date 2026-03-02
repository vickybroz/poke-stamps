"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import { getActiveSearchTerm } from "../_lib/constants";
import { loadImageLibrary } from "../_lib/images";
import type { AdminStampOverviewRow, ImageOption, StampItem } from "../_lib/types";

type StampFormState = {
  id: string;
  name: string;
  description: string;
  image_url: string;
};

export default function AdminStampsPage() {
  const searchParams = useSearchParams();
  const { userId } = useAdminAccess();
  const [stampRows, setStampRows] = useState<AdminStampOverviewRow[]>([]);
  const [stamps, setStamps] = useState<StampItem[]>([]);
  const [imageOptions, setImageOptions] = useState<ImageOption[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openGallery, setOpenGallery] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [stampForm, setStampForm] = useState<StampFormState>({
    id: "",
    name: "",
    description: "",
    image_url: "",
  });

  const queryId = searchParams.get("id");
  const activeSearch = getActiveSearchTerm(search);

  const loadPageData = async () => {
    const [{ data: overviewRows, error: overviewError }, imageResult] =
      await Promise.all([
        supabase.rpc("admin_get_stamps_overview"),
        loadImageLibrary(),
      ]);

    if (overviewError) {
      setFeedback(overviewError.message);
      return;
    }

    const rows = (overviewRows as AdminStampOverviewRow[] | null) ?? [];
    setStampRows(rows);
    setStamps(
      Array.from(
        rows.reduce((map, row) => {
          if (!map.has(row.stamp_id)) {
            map.set(row.stamp_id, {
              id: row.stamp_id,
              name: row.stamp_name,
              description: row.stamp_description,
              image_url: row.stamp_image_url,
            });
          }
          return map;
        }, new Map<string, StampItem>()),
      ).map(([, stamp]) => stamp),
    );
    setImageOptions(imageResult.images);
    if (imageResult.error) {
      setFeedback(imageResult.error);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  const filteredStamps = useMemo(() => {
    return stamps.filter((stampItem) => {
      if (queryId) {
        return stampItem.id === queryId;
      }

      if (!activeSearch) return true;

      const collectionNames = stampRows
        .filter((row) => row.stamp_id === stampItem.id && row.collection_name)
        .map((row) => row.collection_name as string)
        .join(" ");

      return [stampItem.name, stampItem.description ?? "", collectionNames]
        .join(" ")
        .toLowerCase()
        .includes(activeSearch);
    });
  }, [activeSearch, queryId, stampRows, stamps]);

  const resetForm = () => {
    setStampForm({
      id: "",
      name: "",
      description: "",
      image_url: "",
    });
    setOpenGallery(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!userId || !stampForm.name.trim()) {
      setFeedback("Completa el nombre.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload = {
        name: stampForm.name.trim(),
        description: stampForm.description || null,
        image_url: stampForm.image_url || null,
        created_by: userId,
      };

      const { error } = stampForm.id
        ? await supabase.from("stamps").update(payload).eq("id", stampForm.id)
        : await supabase.from("stamps").insert(payload);

      if (error) throw error;

      await loadPageData();
      setFeedback(stampForm.id ? "Stamp actualizada." : "Stamp creada.");
      closeModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo guardar la stamp.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase.from("stamps").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      await loadPageData();
      setFeedback("Stamp eliminada.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar la stamp.");
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (stampItem: StampItem) => {
    setStampForm({
      id: stampItem.id,
      name: stampItem.name,
      description: stampItem.description ?? "",
      image_url: stampItem.image_url ?? "",
    });
    setIsModalOpen(true);
  };

  return (
    <article className="admin-box">
      <h2 className="admin-subtitle">Stamps</h2>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar en stamps"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" className="admin-mini-btn admin-mini-btn-primary" onClick={openCreate}>
          Nuevo
        </button>
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <ul className="admin-stamps-grid">
        {filteredStamps.map((stampItem) => (
          <li key={stampItem.id} className="admin-stamp-item">
            <div className="admin-stamp-actions">
              <button
                type="button"
                className="admin-action-btn admin-action-btn-edit"
                aria-label={`Editar ${stampItem.name}`}
                onClick={() => openEdit(stampItem)}
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
                aria-label={`Borrar ${stampItem.name}`}
                onClick={() => setDeleteTarget({ id: stampItem.id, name: stampItem.name })}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M9 3h6l1 1h4v2H4V4h4l1-1Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 7h12l-1 14H7L6 7Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className="admin-stamp-card"
              onClick={() => openEdit(stampItem)}
            >
              {stampItem.image_url ? (
                <img src={stampItem.image_url} alt={stampItem.name} className="admin-stamp-thumb" />
              ) : (
                <span className="admin-stamp-placeholder">Sin imagen</span>
              )}
              <span className="admin-item-name">{stampItem.name}</span>
            </button>
          </li>
        ))}
      </ul>

      {isModalOpen ? (
        <div className="admin-modal-backdrop" onClick={closeModal}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div />
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
                placeholder="Nombre de stamp"
                value={stampForm.name}
                onChange={(event) =>
                  setStampForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
              <input
                className="auth-input"
                placeholder="Descripcion"
                value={stampForm.description}
                onChange={(event) =>
                  setStampForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
              <div className="admin-image-picker">
                {stampForm.image_url ? (
                  <div className="admin-selected-image">
                    <img
                      src={stampForm.image_url}
                      alt="Imagen seleccionada"
                      className="admin-selected-thumb"
                    />
                    <button
                      type="button"
                      className="admin-mini-btn danger"
                      onClick={() => setStampForm((prev) => ({ ...prev, image_url: "" }))}
                    >
                      Quitar imagen
                    </button>
                  </div>
                ) : (
                  <div className="admin-image-actions">
                    {imageOptions.length ? (
                      <button
                        type="button"
                        className="admin-icon-action"
                        aria-label="Elegir de galeria"
                        onClick={() => setOpenGallery((current) => !current)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                          <path
                            d="M9 4 7.17 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.17L15 4H9Zm3 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-1.8a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    ) : (
                      <p className="admin-muted admin-muted-small">
                        No hay imagenes en el bucket para este tipo.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button className="access-button" type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Guardando..." : stampForm.id ? "Guardar cambios" : "Crear stamp"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openGallery ? (
        <div className="admin-modal-backdrop" onClick={() => setOpenGallery(false)}>
          <div className="admin-modal admin-modal-large" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div />
              <button
                type="button"
                className="admin-icon-close"
                onClick={() => setOpenGallery(false)}
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
            <div className="admin-gallery-picker-grid">
              {imageOptions.map((image) => (
                <button
                  key={image.path}
                  type="button"
                  className="admin-gallery-picker-card"
                  onClick={() => {
                    setStampForm((prev) => ({ ...prev, image_url: image.url }));
                    setOpenGallery(false);
                  }}
                >
                  <img src={image.url} alt={image.label} className="admin-gallery-picker-thumb" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="admin-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="admin-modal admin-modal-small"
            onClick={(event) => event.stopPropagation()}
          >
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
              Seguro que quieres eliminar <strong>{deleteTarget.name}</strong>?
            </p>
            <button
              type="button"
              className="access-button danger"
              onClick={handleDelete}
              disabled={isSaving}
            >
              {isSaving ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

