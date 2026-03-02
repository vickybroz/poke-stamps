"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminAccess } from "../_components/admin-shell";
import {
  ALLOWED_IMAGE_TYPES,
  getActiveSearchTerm,
  IMAGE_BUCKET,
  MAX_IMAGE_SIZE_BYTES,
} from "../_lib/constants";
import { loadImageLibrary } from "../_lib/images";
import type { ImageOption } from "../_lib/types";

export default function AdminGalleryPage() {
  const { userId } = useAdminAccess();
  const [images, setImages] = useState<ImageOption[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImageOption | null>(null);

  const activeSearch = getActiveSearchTerm(search);

  const loadPageData = async () => {
    const imageResult = await loadImageLibrary();
    setImages(imageResult.images);
    if (imageResult.error) {
      setFeedback(imageResult.error);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  const filteredImages = useMemo(() => {
    if (!activeSearch) return images;

    return images.filter((image) =>
      [image.label, image.folder, image.path].join(" ").toLowerCase().includes(activeSearch),
    );
  }, [activeSearch, images]);

  const closeModal = () => {
    setIsModalOpen(false);
    setFile(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setFeedback("Selecciona una imagen.");
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFeedback("Formato no permitido. Usa JPG, PNG o WEBP.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setFeedback("La imagen supera 300KB. Comprimela antes de subir.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `gallery/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

      if (error) throw error;

      await loadPageData();
      setFeedback("Imagen subida.");
      closeModal();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([deleteTarget.path]);
      if (error) throw error;

      await loadPageData();
      setFeedback("Imagen eliminada.");
      setDeleteTarget(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar la imagen.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="admin-box">
      <h2 className="admin-subtitle">Galeria</h2>

      <div className="admin-box-header">
        <input
          className="admin-search-input"
          type="search"
          placeholder="Buscar en galeria"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="admin-mini-btn admin-mini-btn-primary"
          onClick={() => setIsModalOpen(true)}
          disabled={!userId}
        >
          Nuevo
        </button>
      </div>

      {feedback ? <p className="admin-feedback">{feedback}</p> : null}

      <ul className="admin-gallery-grid">
        {filteredImages.map((image) => (
          <li key={image.path} className="admin-gallery-card">
            <div className="admin-gallery-card-actions">
              <button
                type="button"
                className="admin-action-btn admin-action-btn-delete"
                aria-label={`Borrar ${image.label}`}
                onClick={() => setDeleteTarget(image)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="admin-icon-svg">
                  <path
                    d="M9 3h6l1 1h4v2H4V4h4l1-1Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM6 7h12l-1 14H7L6 7Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
            <img src={image.url} alt={image.label} className="admin-gallery-card-thumb" />
            <div className="admin-gallery-card-body">
              <p className="admin-gallery-card-label">{image.label}</p>
              <span className="admin-folder-chip">{image.folder}</span>
            </div>
          </li>
        ))}
      </ul>

      {isModalOpen ? (
        <div className="admin-modal-backdrop" onClick={closeModal}>
          <div className="admin-modal admin-modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h2 className="admin-box-title">Subir imagen</h2>
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
              <label className="admin-file-label admin-file-label-full">
                {file ? file.name : "Seleccionar imagen"}
                <input
                  className="admin-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <button className="access-button" type="button" onClick={handleUpload} disabled={isSaving}>
                {isSaving ? "Subiendo..." : "Subir imagen"}
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
              Seguro que quieres borrar <strong>{deleteTarget.label}</strong>?
            </p>
            <div className="admin-confirm-actions">
              <button type="button" className="admin-mini-btn" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="admin-mini-btn danger"
                onClick={handleDelete}
                disabled={isSaving}
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

